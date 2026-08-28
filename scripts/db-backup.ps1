#Requires -Version 5.1
<#
.SYNOPSIS
    Weekly off-platform logical backup of the NDT Suite Supabase project.

.DESCRIPTION
    Wraps the proven dump sequence from docs/plans/2026-08-17-supabase-project-migration-runbook.md:

      1. roles        (supabase db dump --role-only)
      2. schema       (supabase db dump)
      3. data         (supabase db dump --use-copy --data-only)
      4. history DDL  (supabase db dump --schema supabase_migrations)
      5. history DATA (supabase db dump --use-copy --data-only --schema supabase_migrations)

    The fifth dump is REQUIRED. history.sql is DDL-only; without the data-only pass the
    migration ledger restores empty (verified 2026-08-17).

    Then, beyond the runbook:

      6. storage-policies.sql  - storage.* RLS policies regenerated from the live catalog.
                                 Storage policies do NOT survive a CLI dump (0/33 in the
                                 2026-08-17 dry run). During the migration this DDL was
                                 generated from the still-live source; in a real disaster
                                 there is no source to generate it from, so it is captured
                                 here, at backup time, as a first-class artifact.
      7. storage object BYTES  - rclone --checksum from the Supabase S3-compatible endpoint.
                                 When the off-site stage is configured these stream DIRECTLY
                                 to AWS S3 and never land on local disk (~1.37 GB).
      8. manifest.json         - sha256 + byte size + timestamps per artifact, plus row
                                 counts / policy counts / per-bucket object counts when a
                                 query path is available.

    OFF-SITE STAGE (AWS S3)

    Local disk is a working CACHE, not the durable store. The durable copy is an object in an
    S3 bucket in the owner's AWS account, under a date-partitioned prefix:

        <bucket>/ndt-backups/db/year=YYYY/month=MM/day=DD/ndt-backup-YYYY-MM-DD.7z
        <bucket>/ndt-backups/db/year=YYYY/month=MM/day=DD/ndt-backup-YYYY-MM-DD.manifest.json
        <bucket>/ndt-backups/storage/<supabase-bucket>/...            (object-byte mirror)

    Non-negotiables, enforced here rather than trusted to the operator:

      * The .7z is sealed AND 7z-verified BEFORE anything is uploaded. A plaintext set is
        never sent off-site, so -NoEncrypt / missing 7-Zip / missing passphrase each SKIP the
        upload rather than shipping PII to a bucket.
      * The passphrase never reaches a command line that could be read by the remote or land
        in a transfer log: it is only ever an argument to the local 7z process.
      * The writer credentials are Put/List only, so this script issues NO deletes and NO
        overwrites. Archives go up with `rclone copyto` (per file); the storage mirror uses
        `rclone copy`, never `rclone sync`, so an object deleted in Supabase persists in S3.
        That is deliberate history-keeping, consistent with write-only credentials. Deletion
        belongs to the server-side lifecycle rules, not to this script.
      * Local pruning happens ONLY AFTER the upload is verified. A failed upload prunes
        nothing and exits non-zero.
      * Server-side encryption rides on the bucket default - nothing to do client-side.

    EXIT CODES
      0  fully backed up   - local set created, archive + manifest uploaded and verified
      1  completed with warnings (the off-site copy exists; read the warnings)
      2  refused to start  - configuration / credentials / unsafe output root
      3  a dump failed
      4  backed up LOCALLY ONLY - the off-site stage was skipped (see the SKIP banner)
      5  off-site upload FAILED - local set left intact, nothing pruned

    Credentials are NEVER stored in this repository. They come from a dot-sourced secrets
    file outside the repo (see -SecretsFile) or from explicit parameters.

.PARAMETER DryRun
    Print the resolved plan and exit 0 without creating, writing, deleting or transferring
    anything. Missing credentials are reported as warnings rather than fatal errors so the
    plan can be reviewed on a machine that holds no secrets.

.PARAMETER SecretsFile
    PowerShell file dot-sourced for credentials. Default C:\Users\jonas\supabase-backup\secrets.ps1.
    Expected shape (never committed):

        $env:NDT_BACKUP_DB_URL       = "postgresql://postgres.<ref>:<pw>@<pooler-host>:5432/postgres"
        $env:NDT_BACKUP_S3_KEY       = "<SUPABASE storage S3 access key id>"
        $env:NDT_BACKUP_S3_SECRET    = "<SUPABASE storage S3 secret access key>"
        $env:NDT_BACKUP_PASSPHRASE   = "<archive passphrase>"
        $env:NDT_BACKUP_S3_BUCKET    = "<AWS destination bucket name>"
        $env:NDT_BACKUP_S3_REGION    = "<AWS destination bucket region>"

    Read that block carefully: NDT_BACKUP_S3_KEY / _SECRET are the Supabase SOURCE keys, while
    NDT_BACKUP_S3_BUCKET / _REGION describe the AWS DESTINATION. The AWS keys themselves are
    deliberately NOT here - they live in the rclone remote (see -AwsRemote), which is the one
    credential store for the off-site stage.

.PARAMETER OutputRoot
    Backup root. Default C:\Users\jonas\ndt-backups. MUST be outside the repository and
    outside any OneDrive-synced tree: data.sql carries production PII and password hashes.
    With the off-site stage configured this is a CACHE, not the durable store.

.PARAMETER AwsRemote
    Name of the rclone remote holding the AWS write-only credentials. Default "ndt-aws".
    Created once with `rclone config` - see docs/processes/aws-backup-setup.md. The script
    never writes rclone.conf and never accepts AWS keys as parameters.

.PARAMETER AwsBucket
    AWS destination bucket. Defaults to $env:NDT_BACKUP_S3_BUCKET from the secrets file.

.PARAMETER AwsRegion
    AWS destination region. Defaults to $env:NDT_BACKUP_S3_REGION. Passed to rclone as a
    connection-string parameter scoped to the destination remote only.

.PARAMETER KeyPrefix
    Top-level key prefix inside the bucket. Default "ndt-backups".

.PARAMETER RetentionCount
    Local sets kept when the off-site stage did NOT run. Local is then the durable store, so
    the historic depth of 4 applies. Default 4.

.PARAMETER LocalCacheCount
    Local sets kept once the off-site copy is verified. Local is then only a cache. Default 2.

.PARAMETER SkipUpload
    Run the local backup and skip the off-site stage entirely. Exits 4 (locally only).

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\db-backup.ps1 -DryRun

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\db-backup.ps1

.NOTES
    Windows PowerShell 5.1 compatible: no '&&' / '||' chains, no ternary operator.
    Every file write states its encoding explicitly (UTF-8, no BOM).
    See docs/processes/backup-and-restore.md for scheduling and recovery.
#>

[CmdletBinding()]
param(
    [switch] $DryRun,
    [string] $SecretsFile = 'C:\Users\jonas\supabase-backup\secrets.ps1',
    [string] $OutputRoot = 'C:\Users\jonas\ndt-backups',
    [string] $DbUrl,
    [string] $S3AccessKey,
    [string] $S3SecretKey,
    [string] $S3Region = 'eu-west-2',
    [string] $ProjectRef = 'ntrgjqrbewbvwofupphn',
    [int]    $RetentionCount = 4,

    # --- off-site stage (AWS S3) ---
    [string] $AwsRemote = 'ndt-aws',
    [string] $AwsBucket,
    [string] $AwsRegion,
    [string] $KeyPrefix = 'ndt-backups',
    [ValidateRange(1, 3650)]
    [int]    $LocalCacheCount = 2,
    [switch] $SkipUpload,

    [switch] $SkipStorage,
    [switch] $NoEncrypt
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------

$script:LogLines = New-Object System.Collections.ArrayList
$script:Warnings = New-Object System.Collections.ArrayList

function Write-Log {
    param(
        [string] $Message,
        [ValidateSet('INFO', 'STEP', 'OK', 'WARN', 'FAIL', 'PLAN')]
        [string] $Level = 'INFO'
    )
    $stamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    $line = '{0} [{1}] {2}' -f $stamp, $Level, $Message
    [void]$script:LogLines.Add($line)

    $color = 'Gray'
    if ($Level -eq 'STEP') { $color = 'Cyan' }
    if ($Level -eq 'OK')   { $color = 'Green' }
    if ($Level -eq 'WARN') { $color = 'Yellow' }
    if ($Level -eq 'FAIL') { $color = 'Red' }
    if ($Level -eq 'PLAN') { $color = 'White' }
    Write-Host $line -ForegroundColor $color
}

function Add-Warning {
    param([string] $Message)
    [void]$script:Warnings.Add($Message)
    Write-Log -Level 'WARN' -Message $Message
}

function Write-Utf8File {
    # Explicit UTF-8 WITHOUT BOM. Set-Content -Encoding UTF8 emits a BOM on PS 5.1, and a
    # BOM has already broken the supabase CLI once in this repo (.env scar) - never rely on
    # the default encoding for anything a tool will read back.
    param(
        [Parameter(Mandatory = $true)][string] $Path,
        [Parameter(Mandatory = $true)][AllowEmptyString()][string] $Content
    )
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

function Format-MaskedUrl {
    # postgresql://postgres.<ref>:<pw>@<host>:<port>/<db> -> password replaced with ***
    param([string] $Url)
    if ([string]::IsNullOrWhiteSpace($Url)) { return '<not set>' }
    $masked = [regex]::Replace($Url, '(?<=://[^:/@]+:)[^@]*(?=@)', '***')
    return $masked
}

function Test-CommandAvailable {
    param([string] $Name)
    $cmd = Get-Command $Name -ErrorAction SilentlyContinue
    if ($null -eq $cmd) { return $null }
    return $cmd.Source
}

function Invoke-Native {
    # Every native call goes through here. With $ErrorActionPreference = 'Stop', redirecting a
    # native command's stderr (2>&1) turns ordinary chatter into a TERMINATING error: the
    # supabase CLI's progress output, psql NOTICEs, rclone stats. Exit codes are the truth for
    # native tools, so stderr is demoted to plain output and the caller decides on ExitCode.
    param(
        [Parameter(Mandatory = $true)][string]   $Exe,
        [Parameter(Mandatory = $true)][string[]] $Arguments
    )
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $output = $null
    $code = 0
    try {
        $output = & $Exe @Arguments 2>&1
        $code = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previous
    }
    if ($null -eq $code) { $code = 0 }
    return [pscustomobject]@{ Output = @($output); ExitCode = [int]$code }
}

function Write-NativeOutput {
    param([object[]] $Lines)
    foreach ($line in $Lines) {
        $text = [string]$line
        if (-not [string]::IsNullOrWhiteSpace($text)) { Write-Log -Level 'INFO' -Message ('    {0}' -f $text) }
    }
}

function Resolve-SevenZip {
    $candidates = @(
        'C:\Program Files\7-Zip\7z.exe',
        'C:\Program Files (x86)\7-Zip\7z.exe'
    )
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) { return $candidate }
    }
    $onPath = Test-CommandAvailable -Name '7z'
    if ($null -ne $onPath) { return $onPath }
    return $null
}

# ---------------------------------------------------------------------------
# rclone helpers (off-site stage)
# ---------------------------------------------------------------------------

function Get-PartitionPrefix {
    # ndt-backups/db/year=YYYY/month=MM/day=DD - Hive-style partitioning so a lifecycle rule,
    # an S3 Inventory report or an Athena table can address a day without scanning the bucket.
    param(
        [Parameter(Mandatory = $true)][string] $Prefix,
        [Parameter(Mandatory = $true)][string] $DateKey
    )
    $parts = $DateKey -split '-'
    return ('{0}/db/year={1}/month={2}/day={3}' -f $Prefix, $parts[0], $parts[1], $parts[2])
}

function Get-AwsRemoteSpec {
    # An rclone CONNECTION STRING, not a flag. Two traps this avoids:
    #
    #   1. Backend flags such as --s3-region / --s3-no-check-bucket apply to EVERY s3 remote in
    #      the command. The storage mirror names two s3 remotes at once (Supabase source, AWS
    #      destination), so a bare flag would silently reconfigure the source too.
    #   2. RCLONE_S3_* backend environment variables OUTRANK the rclone config file. Setting
    #      them for the Supabase source would override the AWS remote's stored credentials
    #      mid-command. That is why the Supabase source is expressed as a remote-specific
    #      RCLONE_CONFIG_NDTSUPA_* remote instead (see Step 4).
    #
    # Connection-string parameters are scoped to the one remote they are attached to and take
    # highest precedence. Requires rclone 1.56 or newer.
    #
    # Both options below are REQUIRED by the write-only IAM policy, not preferences:
    #
    #   no_check_bucket=true - otherwise rclone probes and may try to create the bucket before
    #                          uploading, and the writer has neither HeadBucket nor CreateBucket.
    #   no_head=true         - by default rclone issues a HEAD on the object it just PUT to
    #                          confirm size and ETag. The writer has no GetObject, so that HEAD
    #                          returns 403 and a successful upload is reported as a failure.
    #                          The compensating check is the lsjson listing in Step 7, which
    #                          needs only ListBucket and confirms name and byte size.
    param(
        [Parameter(Mandatory = $true)][string] $Remote,
        [string] $Region,
        [Parameter(Mandatory = $true)][string] $Path
    )
    $spec = $Remote + ',no_check_bucket=true,no_head=true'
    if (-not [string]::IsNullOrWhiteSpace($Region)) { $spec = $spec + (',region={0}' -f $Region) }
    return ('{0}:{1}' -f $spec, $Path)
}

function Test-RcloneRemote {
    param([Parameter(Mandatory = $true)][string] $Name)
    if ($null -eq (Test-CommandAvailable -Name 'rclone')) { return $false }
    $res = Invoke-Native -Exe 'rclone' -Arguments @('listremotes')
    if ($res.ExitCode -ne 0) { return $false }
    foreach ($line in $res.Output) {
        if (([string]$line).Trim() -eq ($Name + ':')) { return $true }
    }
    return $false
}

function ConvertFrom-RcloneJson {
    # rclone writes the JSON document to stdout but can interleave NOTICE lines on stderr, and
    # Invoke-Native merges the two. Slice from the first '[' to the last ']' rather than
    # trusting the whole stream to parse.
    param([object[]] $Lines)
    $text = [string](($Lines | ForEach-Object { [string]$_ }) -join "`n")
    $start = $text.IndexOf('[')
    $end = $text.LastIndexOf(']')
    if ($start -lt 0 -or $end -le $start) { return $null }
    try { return @(ConvertFrom-Json -InputObject $text.Substring($start, ($end - $start + 1))) }
    catch { return $null }
}

# ---------------------------------------------------------------------------
# Credential resolution
# ---------------------------------------------------------------------------

function Import-BackupSecrets {
    param([string] $Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        return $false
    }
    Write-Log -Level 'INFO' -Message ('Dot-sourcing secrets file: {0}' -f $Path)
    . $Path
    return $true
}

$secretsLoaded = $false
if (-not [string]::IsNullOrWhiteSpace($SecretsFile)) {
    $secretsLoaded = Import-BackupSecrets -Path $SecretsFile
}

if ([string]::IsNullOrWhiteSpace($DbUrl))       { $DbUrl = $env:NDT_BACKUP_DB_URL }
if ([string]::IsNullOrWhiteSpace($S3AccessKey)) { $S3AccessKey = $env:NDT_BACKUP_S3_KEY }
if ([string]::IsNullOrWhiteSpace($S3SecretKey)) { $S3SecretKey = $env:NDT_BACKUP_S3_SECRET }
if ([string]::IsNullOrWhiteSpace($AwsBucket))   { $AwsBucket = $env:NDT_BACKUP_S3_BUCKET }
if ([string]::IsNullOrWhiteSpace($AwsRegion))   { $AwsRegion = $env:NDT_BACKUP_S3_REGION }
$passphrase = $env:NDT_BACKUP_PASSPHRASE

# ---------------------------------------------------------------------------
# Safety: never write PII dumps into the repo or a synced folder
# ---------------------------------------------------------------------------

$repoRoot = Split-Path -Parent $PSScriptRoot
$outputFull = [System.IO.Path]::GetFullPath($OutputRoot)

if ($outputFull -like ($repoRoot + '*')) {
    Write-Log -Level 'FAIL' -Message ('Refusing to run: OutputRoot "{0}" is inside the repository.' -f $outputFull)
    Write-Log -Level 'FAIL' -Message 'data.sql carries production PII and password hashes; it must never enter git.'
    exit 2
}
if ($outputFull -match '(?i)onedrive') {
    Write-Log -Level 'FAIL' -Message ('Refusing to run: OutputRoot "{0}" looks OneDrive-synced.' -f $outputFull)
    Write-Log -Level 'FAIL' -Message 'Dumps must stay off cloud sync. C:\Users\jonas\ is not synced; Desktop/Documents are.'
    exit 2
}

# ---------------------------------------------------------------------------
# Tool discovery
# ---------------------------------------------------------------------------

$supabaseCmd = Test-CommandAvailable -Name 'supabase'
$dockerCmd   = Test-CommandAvailable -Name 'docker'
$rcloneCmd   = Test-CommandAvailable -Name 'rclone'
$sevenZip    = Resolve-SevenZip

$dateKey    = (Get-Date).ToString('yyyy-MM-dd')
$backupDir  = Join-Path $outputFull $dateKey
$queryDir   = Join-Path $backupDir '.queries'
$storageDir = Join-Path $backupDir 'storage'
$archiveName  = 'ndt-backup-{0}.7z' -f $dateKey
$manifestName = 'ndt-backup-{0}.manifest.json' -f $dateKey
$archivePath  = Join-Path $outputFull $archiveName
$sidecarPath  = Join-Path $outputFull $manifestName

# ---------------------------------------------------------------------------
# Off-site destination (AWS S3) - resolved once, reported the same way by dry run and real run
# ---------------------------------------------------------------------------

$partitionPrefix = Get-PartitionPrefix -Prefix $KeyPrefix -DateKey $dateKey
$archiveKey  = '{0}/{1}' -f $partitionPrefix, $archiveName
$manifestKey = '{0}/{1}' -f $partitionPrefix, $manifestName

$offsiteMissing = New-Object System.Collections.ArrayList
if ($null -eq $rcloneCmd) {
    [void]$offsiteMissing.Add('rclone is not installed or not on PATH')
}
elseif (-not (Test-RcloneRemote -Name $AwsRemote)) {
    [void]$offsiteMissing.Add(('rclone remote "{0}:" is not configured (rclone config - see docs/processes/aws-backup-setup.md)' -f $AwsRemote))
}
if ([string]::IsNullOrWhiteSpace($AwsBucket)) {
    [void]$offsiteMissing.Add('$env:NDT_BACKUP_S3_BUCKET (AWS destination bucket) is not set')
}
$offsiteConfigured = ($offsiteMissing.Count -eq 0)

# The storage mirror goes Supabase -> AWS with no local staging when the destination is ready.
# -SkipUpload falls back to the historic local copy so the switch means "no off-site this run",
# not "no storage backup at all".
$storageDirect = ($offsiteConfigured -and -not $SkipUpload)

$dumpPlan = @(
    [pscustomobject]@{ File = 'roles.sql';        Args = @('--role-only') },
    [pscustomobject]@{ File = 'schema.sql';       Args = @() },
    [pscustomobject]@{ File = 'data.sql';         Args = @('--use-copy', '--data-only', '-x', 'storage.buckets_vectors', '-x', 'storage.vector_indexes') },
    [pscustomobject]@{ File = 'history.sql';      Args = @('--schema', 'supabase_migrations') },
    [pscustomobject]@{ File = 'history-data.sql'; Args = @('--use-copy', '--data-only', '--schema', 'supabase_migrations') }
)

# ---------------------------------------------------------------------------
# Retention planning (shared by dry run and real run)
# ---------------------------------------------------------------------------

function Get-BackupSets {
    param([string] $Root)
    $sets = @{}
    if (-not (Test-Path -LiteralPath $Root)) { return $sets }

    $dirs = Get-ChildItem -LiteralPath $Root -Directory -ErrorAction SilentlyContinue
    foreach ($dir in $dirs) {
        if ($dir.Name -match '^\d{4}-\d{2}-\d{2}$') {
            if (-not $sets.ContainsKey($dir.Name)) { $sets[$dir.Name] = New-Object System.Collections.ArrayList }
            [void]$sets[$dir.Name].Add($dir.FullName)
        }
    }
    $files = Get-ChildItem -LiteralPath $Root -File -Filter 'ndt-backup-*.7z' -ErrorAction SilentlyContinue
    foreach ($file in $files) {
        if ($file.Name -match '^ndt-backup-(\d{4}-\d{2}-\d{2})\.7z$') {
            $key = $Matches[1]
            if (-not $sets.ContainsKey($key)) { $sets[$key] = New-Object System.Collections.ArrayList }
            [void]$sets[$key].Add($file.FullName)
        }
    }
    # The manifest sidecar belongs to the same dated set and must prune with it, otherwise the
    # cache root slowly fills with orphaned indexes of archives that are only in S3.
    $sidecars = Get-ChildItem -LiteralPath $Root -File -Filter 'ndt-backup-*.manifest.json' -ErrorAction SilentlyContinue
    foreach ($file in $sidecars) {
        if ($file.Name -match '^ndt-backup-(\d{4}-\d{2}-\d{2})\.manifest\.json$') {
            $key = $Matches[1]
            if (-not $sets.ContainsKey($key)) { $sets[$key] = New-Object System.Collections.ArrayList }
            [void]$sets[$key].Add($file.FullName)
        }
    }
    return $sets
}

function Get-PruneTargets {
    param(
        [hashtable] $Sets,
        [string]    $KeepKey,
        [int]       $Keep
    )
    $keys = New-Object System.Collections.ArrayList
    foreach ($k in $Sets.Keys) { [void]$keys.Add($k) }
    if (-not $keys.Contains($KeepKey)) { [void]$keys.Add($KeepKey) }

    $ordered = $keys | Sort-Object -Descending
    $doomedKeys = @($ordered | Select-Object -Skip $Keep)

    $paths = New-Object System.Collections.ArrayList
    foreach ($k in $doomedKeys) {
        if ($Sets.ContainsKey($k)) {
            foreach ($p in $Sets[$k]) { [void]$paths.Add($p) }
        }
    }
    return $paths
}

# ---------------------------------------------------------------------------
# DRY RUN
# ---------------------------------------------------------------------------

if ($DryRun) {
    Write-Host ''
    Write-Log -Level 'PLAN' -Message '=== NDT Suite backup - DRY RUN (nothing will be created, written or deleted) ==='
    Write-Log -Level 'PLAN' -Message ('Project ref     : {0}' -f $ProjectRef)
    Write-Log -Level 'PLAN' -Message ('Output root     : {0}' -f $outputFull)
    Write-Log -Level 'PLAN' -Message ('Backup set      : {0}' -f $backupDir)
    Write-Log -Level 'PLAN' -Message ('Secrets file    : {0} (present: {1})' -f $SecretsFile, $secretsLoaded)
    Write-Log -Level 'PLAN' -Message ('DB url          : {0}' -f (Format-MaskedUrl -Url $DbUrl))
    Write-Log -Level 'PLAN' -Message ('Local retention : keep {0} sets off-site-only / {1} sets when the S3 copy is verified' -f $RetentionCount, $LocalCacheCount)

    Write-Host ''
    Write-Log -Level 'PLAN' -Message '--- Off-site destination (AWS S3) ---'
    $bucketText = $AwsBucket
    if ([string]::IsNullOrWhiteSpace($bucketText)) { $bucketText = '<NDT_BACKUP_S3_BUCKET not set>' }
    $regionText = $AwsRegion
    if ([string]::IsNullOrWhiteSpace($regionText)) { $regionText = '<NDT_BACKUP_S3_REGION not set - the rclone remote default applies>' }
    Write-Log -Level 'PLAN' -Message ('  rclone remote : {0}:  (AWS keys live in rclone.conf, never in this repo or the secrets file)' -f $AwsRemote)
    Write-Log -Level 'PLAN' -Message ('  bucket        : {0}' -f $bucketText)
    Write-Log -Level 'PLAN' -Message ('  region        : {0}' -f $regionText)
    Write-Log -Level 'PLAN' -Message ('  archive key   : {0}' -f $archiveKey)
    Write-Log -Level 'PLAN' -Message ('  manifest key  : {0}' -f $manifestKey)
    Write-Log -Level 'PLAN' -Message ('  storage prefix: {0}/storage/<supabase-bucket>/' -f $KeyPrefix)
    if ($offsiteConfigured) {
        Write-Log -Level 'OK' -Message '  destination is configured - a real run would upload'
    }
    else {
        Write-Log -Level 'WARN' -Message '  destination NOT configured - a real run would back up LOCALLY ONLY (exit 4):'
        foreach ($m in $offsiteMissing) { Write-Log -Level 'WARN' -Message ('    - {0}' -f $m) }
    }

    Write-Host ''
    Write-Log -Level 'PLAN' -Message '--- Tooling ---'
    if ($null -ne $supabaseCmd) { Write-Log -Level 'OK'   -Message ('supabase : {0}' -f $supabaseCmd) }
    else                        { Write-Log -Level 'FAIL' -Message 'supabase : NOT FOUND - dumps cannot run' }
    if ($null -ne $dockerCmd)   { Write-Log -Level 'OK'   -Message ('docker   : {0}' -f $dockerCmd) }
    else                        { Write-Log -Level 'WARN' -Message 'docker   : NOT FOUND - dumps and row counts both need it' }
    if ($null -ne $rcloneCmd)   { Write-Log -Level 'OK'   -Message ('rclone   : {0}' -f $rcloneCmd) }
    else                        { Write-Log -Level 'WARN' -Message 'rclone   : NOT FOUND - storage object bytes would be SKIPPED' }
    if ($null -ne $sevenZip)    { Write-Log -Level 'OK'   -Message ('7-Zip    : {0}' -f $sevenZip) }
    else                        { Write-Log -Level 'WARN' -Message '7-Zip    : NOT FOUND - archive would stay PLAINTEXT on disk' }

    Write-Host ''
    Write-Log -Level 'PLAN' -Message '--- Step 1: 5-dump sequence (supabase db dump --db-url <masked>) ---'
    foreach ($dump in $dumpPlan) {
        $argText = ''
        if ($dump.Args.Count -gt 0) { $argText = ' ' + ($dump.Args -join ' ') }
        Write-Log -Level 'PLAN' -Message ('  -f {0}{1}' -f (Join-Path $backupDir $dump.File), $argText)
    }
    Write-Log -Level 'PLAN' -Message '  (history-data.sql is REQUIRED - history.sql is DDL-only and restores an empty ledger)'

    Write-Host ''
    Write-Log -Level 'PLAN' -Message '--- Step 2: storage policy catalog capture ---'
    Write-Log -Level 'PLAN' -Message ('  docker run --rm postgres:17 psql -> {0}' -f (Join-Path $backupDir 'storage-policies.sql'))
    Write-Log -Level 'PLAN' -Message '  (storage.* policies do NOT survive a CLI dump - 0/33 in the 2026-08-17 dry run)'

    Write-Host ''
    Write-Log -Level 'PLAN' -Message '--- Step 3: database state capture (row counts / policy counts / bucket counts) ---'
    Write-Log -Level 'PLAN' -Message '  docker run --rm postgres:17 psql -At -f <query> (skipped with a warning if docker is unavailable)'

    Write-Host ''
    Write-Log -Level 'PLAN' -Message '--- Step 4: storage object bytes ---'
    if ($SkipStorage) {
        Write-Log -Level 'PLAN' -Message '  SKIPPED (-SkipStorage)'
    }
    else {
        $planStorageDest = ('{0}\<bucket>' -f $storageDir)
        if ($storageDirect) {
            $planStorageDest = Get-AwsRemoteSpec -Remote $AwsRemote -Region $AwsRegion -Path ('{0}/{1}/storage/<bucket>' -f $bucketText, $KeyPrefix)
            Write-Log -Level 'PLAN' -Message '  DIRECT Supabase -> AWS S3: the ~1.37 GB of object bytes never touches local disk'
        }
        else {
            Write-Log -Level 'PLAN' -Message '  local staging (off-site destination not configured, or -SkipUpload)'
        }
        Write-Log -Level 'PLAN' -Message ('  rclone copy ndtsupa:<bucket> "{0}" --checksum --stats-one-line --stats 30s' -f $planStorageDest)
        Write-Log -Level 'PLAN' -Message ('  source endpoint https://{0}.storage.supabase.co/storage/v1/s3  region {1}' -f $ProjectRef, $S3Region)
        Write-Log -Level 'PLAN' -Message '  source credentials passed via RCLONE_CONFIG_NDTSUPA_* env vars, never on the command line'
        Write-Log -Level 'PLAN' -Message '  copy, NOT sync: nothing is ever deleted remotely (the writer policy is Put/List only)'
    }

    Write-Host ''
    Write-Log -Level 'PLAN' -Message '--- Step 5: manifest ---'
    Write-Log -Level 'PLAN' -Message ('  {0} (sha256 + bytes + timestamps per artifact)' -f (Join-Path $backupDir 'manifest.json'))

    Write-Host ''
    Write-Log -Level 'PLAN' -Message '--- Step 6: encryption ---'
    $planWouldEncrypt = $false
    if ($NoEncrypt) {
        Write-Log -Level 'PLAN' -Message '  SKIPPED (-NoEncrypt) - plaintext dumps remain on disk'
    }
    elseif ($null -eq $sevenZip) {
        Write-Log -Level 'PLAN' -Message '  SKIPPED - 7-Zip not installed. Plaintext PII would remain on disk (loud warning at runtime).'
    }
    elseif ([string]::IsNullOrWhiteSpace($passphrase)) {
        Write-Log -Level 'PLAN' -Message '  SKIPPED - NDT_BACKUP_PASSPHRASE not set. Never encrypting with an empty password.'
    }
    else {
        $planWouldEncrypt = $true
        Write-Log -Level 'PLAN' -Message ('  {0} a -t7z -mhe=on -p*** {1}' -f $sevenZip, $archivePath)
        Write-Log -Level 'PLAN' -Message '  archive is verified (7z t) BEFORE the plaintext folder is deleted'
        Write-Log -Level 'PLAN' -Message ('  manifest sidecar written beside it: {0}' -f $sidecarPath)
    }

    Write-Host ''
    Write-Log -Level 'PLAN' -Message '--- Step 7: off-site upload (AWS S3) ---'
    if ($SkipUpload) {
        Write-Log -Level 'PLAN' -Message '  SKIPPED (-SkipUpload) - a real run would exit 4 (backed up locally only)'
    }
    elseif (-not $planWouldEncrypt) {
        Write-Log -Level 'PLAN' -Message '  SKIPPED - no verified encrypted archive would exist. Plaintext is NEVER uploaded.'
        Write-Log -Level 'PLAN' -Message '  A real run would exit 4 (backed up locally only).'
    }
    elseif (-not $offsiteConfigured) {
        Write-Log -Level 'PLAN' -Message '  SKIPPED - destination not configured. A real run would exit 4 (backed up locally only):'
        foreach ($m in $offsiteMissing) { Write-Log -Level 'PLAN' -Message ('    - {0}' -f $m) }
    }
    else {
        $planArchiveDest  = Get-AwsRemoteSpec -Remote $AwsRemote -Region $AwsRegion -Path ('{0}/{1}' -f $AwsBucket, $archiveKey)
        $planManifestDest = Get-AwsRemoteSpec -Remote $AwsRemote -Region $AwsRegion -Path ('{0}/{1}' -f $AwsBucket, $manifestKey)
        $planListDest     = Get-AwsRemoteSpec -Remote $AwsRemote -Region $AwsRegion -Path ('{0}/{1}' -f $AwsBucket, $partitionPrefix)
        Write-Log -Level 'PLAN' -Message ('  rclone copyto "{0}" "{1}" --no-check-dest --stats-one-line --stats 30s' -f $archivePath, $planArchiveDest)
        Write-Log -Level 'PLAN' -Message ('  rclone copyto "{0}" "{1}" --no-check-dest --stats-one-line --stats 30s' -f $sidecarPath, $planManifestDest)
        Write-Log -Level 'PLAN' -Message ('  rclone lsjson "{0}"' -f $planListDest)
        Write-Log -Level 'PLAN' -Message '  no passphrase, key or secret appears in any of the above - the AWS keys are in rclone.conf'
        Write-Log -Level 'PLAN' -Message '  verification is name+size from the LISTING: the writer policy has no GetObject by design,'
        Write-Log -Level 'PLAN' -Message '  and content is proven by sha256 against the manifest at restore time.'
    }

    Write-Host ''
    Write-Log -Level 'PLAN' -Message '--- Step 8: local retention ---'
    $planKeep = $RetentionCount
    if ($SkipUpload -or -not $planWouldEncrypt -or -not $offsiteConfigured) {
        Write-Log -Level 'PLAN' -Message ('  keep {0} (local is the DURABLE store this run - no off-site copy)' -f $planKeep)
    }
    else {
        $planKeep = $LocalCacheCount
        Write-Log -Level 'PLAN' -Message ('  keep {0} (local is a CACHE - the durable copy is in S3)' -f $planKeep)
        Write-Log -Level 'PLAN' -Message ('  if the upload FAILED it would keep everything and exit 5 instead')
    }
    $sets = Get-BackupSets -Root $outputFull
    $doomed = Get-PruneTargets -Sets $sets -KeepKey $dateKey -Keep $planKeep
    if ($doomed.Count -eq 0) {
        Write-Log -Level 'PLAN' -Message '  nothing to prune'
    }
    else {
        foreach ($p in $doomed) { Write-Log -Level 'PLAN' -Message ('  would DELETE {0}' -f $p) }
    }
    Write-Log -Level 'PLAN' -Message '  local pruning only - objects in S3 are never deleted by this script (lifecycle rules own that)'

    Write-Host ''
    $blockers = 0
    if ($null -eq $supabaseCmd) { $blockers = $blockers + 1 }
    if ([string]::IsNullOrWhiteSpace($DbUrl)) {
        Write-Log -Level 'WARN' -Message 'No database URL resolved. A real run would REFUSE to start.'
        Write-Log -Level 'WARN' -Message ('Provide -DbUrl or set $env:NDT_BACKUP_DB_URL in {0}' -f $SecretsFile)
        $blockers = $blockers + 1
    }
    if ($blockers -eq 0) { Write-Log -Level 'OK' -Message 'Dry run complete - plan is executable.' }
    else                 { Write-Log -Level 'WARN' -Message ('Dry run complete - {0} blocker(s) would stop a real run.' -f $blockers) }
    Write-Host ''
    exit 0
}

# ---------------------------------------------------------------------------
# REAL RUN - credential gate
# ---------------------------------------------------------------------------

Write-Log -Level 'STEP' -Message '=== NDT Suite backup ==='

if ([string]::IsNullOrWhiteSpace($DbUrl)) {
    Write-Log -Level 'FAIL' -Message 'No database connection string.'
    Write-Log -Level 'FAIL' -Message ('Expected $env:NDT_BACKUP_DB_URL from {0}, or an explicit -DbUrl.' -f $SecretsFile)
    Write-Log -Level 'FAIL' -Message 'Credentials are never read from the repository. Aborting.'
    exit 2
}
if ($null -eq $supabaseCmd) {
    Write-Log -Level 'FAIL' -Message 'supabase CLI not found on PATH. Aborting.'
    exit 2
}

Write-Log -Level 'INFO' -Message ('Project ref : {0}' -f $ProjectRef)
Write-Log -Level 'INFO' -Message ('Target      : {0}' -f (Format-MaskedUrl -Url $DbUrl))
Write-Log -Level 'INFO' -Message ('Backup set  : {0}' -f $backupDir)

[void](New-Item -ItemType Directory -Path $backupDir -Force)
[void](New-Item -ItemType Directory -Path $queryDir -Force)

# ---------------------------------------------------------------------------
# Step 1 - the 5-dump sequence
# ---------------------------------------------------------------------------

Write-Log -Level 'STEP' -Message 'Step 1/8  Logical dumps (5-part sequence)'

foreach ($dump in $dumpPlan) {
    $target = Join-Path $backupDir $dump.File
    Write-Log -Level 'INFO' -Message ('  dumping {0}' -f $dump.File)

    $dumpArgs = @('db', 'dump', '--db-url', $DbUrl, '-f', $target)
    if ($dump.Args.Count -gt 0) { $dumpArgs = $dumpArgs + $dump.Args }

    $dumpResult = Invoke-Native -Exe 'supabase' -Arguments $dumpArgs
    Write-NativeOutput -Lines $dumpResult.Output
    if ($dumpResult.ExitCode -ne 0) {
        Write-Log -Level 'FAIL' -Message ('  supabase db dump exited {0} for {1}' -f $dumpResult.ExitCode, $dump.File)
        exit 3
    }

    if (-not (Test-Path -LiteralPath $target)) {
        Write-Log -Level 'FAIL' -Message ('  dump produced no file: {0}' -f $dump.File)
        exit 3
    }
    $size = (Get-Item -LiteralPath $target).Length
    if ($size -le 0) {
        Write-Log -Level 'FAIL' -Message ('  dump produced an EMPTY file: {0}' -f $dump.File)
        exit 3
    }
    Write-Log -Level 'OK' -Message ('  {0} ({1:N0} bytes)' -f $dump.File, $size)
}

# ---------------------------------------------------------------------------
# Query helper (dockerized psql - there is no local psql on this machine)
# ---------------------------------------------------------------------------

function Invoke-PsqlScalar {
    param(
        [Parameter(Mandatory = $true)][string] $Sql,
        [Parameter(Mandatory = $true)][string] $Name
    )
    if ($null -eq $dockerCmd) { return $null }

    $queryFile = Join-Path $queryDir ($Name + '.sql')
    Write-Utf8File -Path $queryFile -Content $Sql

    $dockerArgs = @(
        'run', '--rm',
        '-v', ('{0}:/q' -f $queryDir),
        'postgres:17',
        'psql', $DbUrl,
        '-v', 'ON_ERROR_STOP=1',
        '-At',
        '-f', ('/q/{0}.sql' -f $Name)
    )
    $result = Invoke-Native -Exe 'docker' -Arguments $dockerArgs
    if ($result.ExitCode -ne 0) {
        Write-NativeOutput -Lines $result.Output
        Add-Warning -Message ('psql query "{0}" exited {1}' -f $Name, $result.ExitCode)
        return $null
    }
    # [string] cast before anything downstream serializes this: native command output in
    # PS 5.1 carries ETS note properties and ConvertTo-Json turns it into an object.
    $text = [string](($result.Output | ForEach-Object { [string]$_ }) -join "`n")
    return $text.Trim()
}

$rowCountsSql = @'
select coalesce(json_object_agg(tbl, n), '{}'::json)::text
from (
  select t.table_schema || '.' || t.table_name as tbl,
         (xpath('/row/c/text()',
            query_to_xml(format('select count(*) as c from %I.%I', t.table_schema, t.table_name),
                         false, true, '')))[1]::text::bigint as n
  from information_schema.tables t
  where t.table_schema in ('public', 'auth', 'storage')
    and t.table_type = 'BASE TABLE'
) s;
'@

$policyCountsSql = @'
select json_build_object(
  'public',  count(*) filter (where schemaname = 'public'),
  'storage', count(*) filter (where schemaname = 'storage'),
  'total',   count(*)
)::text
from pg_policies;
'@

$historyCountSql = @'
select case
         when to_regclass('supabase_migrations.schema_migrations') is null then '-1'
         else (select count(*)::text from supabase_migrations.schema_migrations)
       end;
'@

$bucketCountsSql = @'
select coalesce(json_object_agg(bucket_id, json_build_object('objects', c, 'bytes', b)), '{}'::json)::text
from (
  select bucket_id, count(*) as c, coalesce(sum((metadata->>'size')::bigint), 0) as b
  from storage.objects
  group by bucket_id
) t;
'@

$bucketListSql = @'
select coalesce(string_agg(id, ',' order by id), '') from storage.buckets;
'@

# Verbatim from the migration runbook: storage policies are excluded from the CLI dump, so
# their DDL has to be regenerated from the catalog. Captured now, while the source is alive.
$storagePolicySql = @'
select 'create policy ' || quote_ident(policyname) || ' on storage.' || quote_ident(tablename)
  || case when permissive = 'RESTRICTIVE' then ' as restrictive' else '' end
  || ' for ' || lower(cmd) || ' to ' || array_to_string(roles, ', ')
  || coalesce(' using (' || qual || ')', '')
  || coalesce(' with check (' || with_check || ')', '') || ';'
from pg_policies
where schemaname = 'storage'
order by tablename, policyname;
'@

# ---------------------------------------------------------------------------
# Step 2 - storage policy catalog capture
# ---------------------------------------------------------------------------

Write-Log -Level 'STEP' -Message 'Step 2/8  Storage policy catalog capture'

$storagePolicyPath = Join-Path $backupDir 'storage-policies.sql'
if ($null -eq $dockerCmd) {
    Add-Warning -Message 'docker not available - storage-policies.sql NOT captured. A restore from this set will land 0 storage policies and every signed-URL path will break. Fix docker and re-run.'
}
else {
    $policyDdl = Invoke-PsqlScalar -Sql $storagePolicySql -Name 'storage-policies'
    if ([string]::IsNullOrWhiteSpace($policyDdl)) {
        Add-Warning -Message 'storage policy capture returned nothing - storage-policies.sql NOT written.'
    }
    else {
        $header = "-- Regenerated from pg_policies on {0} at {1}Z.`n-- Storage policies do not survive a supabase CLI dump; apply this after schema+data.`n`n" -f $ProjectRef, (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss')
        Write-Utf8File -Path $storagePolicyPath -Content ($header + $policyDdl + "`n")
        $policyLines = ($policyDdl -split "`n").Count
        Write-Log -Level 'OK' -Message ('  storage-policies.sql ({0} statements)' -f $policyLines)
    }
}

# ---------------------------------------------------------------------------
# Step 3 - database state capture
# ---------------------------------------------------------------------------

Write-Log -Level 'STEP' -Message 'Step 3/8  Database state capture'

$rowCounts   = $null
$policyCount = $null
$historyRows = $null
$bucketStats = $null
$bucketList  = @()

if ($null -eq $dockerCmd) {
    Add-Warning -Message 'docker not available - manifest will carry no row counts, policy counts or bucket counts. The restore verification gate degrades to artifact hashes only.'
}
else {
    $rowCounts   = Invoke-PsqlScalar -Sql $rowCountsSql    -Name 'row-counts'
    $policyCount = Invoke-PsqlScalar -Sql $policyCountsSql -Name 'policy-counts'
    $historyRows = Invoke-PsqlScalar -Sql $historyCountSql -Name 'history-count'
    $bucketStats = Invoke-PsqlScalar -Sql $bucketCountsSql -Name 'bucket-counts'
    $bucketRaw   = Invoke-PsqlScalar -Sql $bucketListSql   -Name 'bucket-list'
    if (-not [string]::IsNullOrWhiteSpace($bucketRaw)) {
        $bucketList = @($bucketRaw -split ',' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    }
    if (-not [string]::IsNullOrWhiteSpace($policyCount)) {
        Write-Log -Level 'OK' -Message ('  policy counts : {0}' -f $policyCount)
    }
    if (-not [string]::IsNullOrWhiteSpace($historyRows)) {
        Write-Log -Level 'OK' -Message ('  migration ledger rows : {0}' -f $historyRows)
    }
    if ($bucketList.Count -gt 0) {
        Write-Log -Level 'OK' -Message ('  buckets : {0}' -f ($bucketList -join ', '))
    }
}

# ---------------------------------------------------------------------------
# Step 4 - storage object bytes via rclone
# ---------------------------------------------------------------------------

Write-Log -Level 'STEP' -Message 'Step 4/8  Storage object bytes'

$storageSynced = $false
$storageBucketsSynced = @()
$storageTarget = 'none'
$storageFailures = 0

if ($SkipStorage) {
    Write-Log -Level 'INFO' -Message '  skipped (-SkipStorage)'
}
elseif ($null -eq $rcloneCmd) {
    Add-Warning -Message 'rclone not installed - storage object BYTES were NOT backed up. The dumps carry storage.objects metadata rows only; the files themselves are not in this set. Install rclone, or run the official Supabase storage migration Node script, then re-run with -SkipStorage removed.'
}
elseif ([string]::IsNullOrWhiteSpace($S3AccessKey) -or [string]::IsNullOrWhiteSpace($S3SecretKey)) {
    Add-Warning -Message 'No S3 access keys resolved - storage object BYTES were NOT backed up. Set NDT_BACKUP_S3_KEY / NDT_BACKUP_S3_SECRET in the secrets file (Dashboard -> Storage -> S3 access keys).'
}
elseif ($bucketList.Count -eq 0) {
    Add-Warning -Message 'Bucket list unavailable (needs the docker/psql path) - storage object BYTES were NOT backed up.'
}
else {
    if ($storageDirect) {
        $storageTarget = 'aws-s3'
        Write-Log -Level 'INFO' -Message ('  destination: {0}: bucket {1}, prefix {2}/storage/ (direct - no local staging)' -f $AwsRemote, $AwsBucket, $KeyPrefix)
    }
    else {
        $storageTarget = 'local'
        [void](New-Item -ItemType Directory -Path $storageDir -Force)
        Write-Log -Level 'INFO' -Message ('  destination: {0} (local - the off-site destination is not configured, or -SkipUpload)' -f $storageDir)
    }

    # Supabase source credentials go in as REMOTE-SPECIFIC env vars, defining an ephemeral
    # remote named "ndtsupa". They never appear on a command line or in rclone.conf, and they
    # are cleared in the finally block below.
    #
    # Why not the older RCLONE_S3_* form: those are BACKEND env vars, which outrank the rclone
    # config file for every s3 remote in the process. In the direct Supabase -> AWS command
    # both endpoints are s3, so RCLONE_S3_ACCESS_KEY_ID would silently override the AWS
    # remote's stored credentials and the transfer would authenticate to AWS with Supabase
    # keys. RCLONE_CONFIG_NDTSUPA_* is scoped to this one remote and cannot leak across.
    $env:RCLONE_CONFIG_NDTSUPA_TYPE              = 's3'
    $env:RCLONE_CONFIG_NDTSUPA_PROVIDER          = 'Other'
    $env:RCLONE_CONFIG_NDTSUPA_ACCESS_KEY_ID     = $S3AccessKey
    $env:RCLONE_CONFIG_NDTSUPA_SECRET_ACCESS_KEY = $S3SecretKey
    $env:RCLONE_CONFIG_NDTSUPA_ENDPOINT          = ('https://{0}.storage.supabase.co/storage/v1/s3' -f $ProjectRef)
    $env:RCLONE_CONFIG_NDTSUPA_REGION            = $S3Region
    try {
        foreach ($bucket in $bucketList) {
            if ($storageDirect) {
                $dest = Get-AwsRemoteSpec -Remote $AwsRemote -Region $AwsRegion -Path ('{0}/{1}/storage/{2}' -f $AwsBucket, $KeyPrefix, $bucket)
            }
            else {
                $dest = Join-Path $storageDir $bucket
            }
            Write-Log -Level 'INFO' -Message ('  syncing bucket {0}' -f $bucket)

            # copy, never sync. sync deletes destination objects that are gone from the source,
            # and the writer IAM policy has no DeleteObject - the call would fail, and even if
            # it did not, removing history is exactly what an off-site backup must not do.
            $sync = Invoke-Native -Exe 'rclone' -Arguments @(
                'copy', ('ndtsupa:' + $bucket), $dest, '--checksum', '--stats-one-line', '--stats', '30s'
            )
            Write-NativeOutput -Lines $sync.Output
            if ($sync.ExitCode -ne 0) {
                $storageFailures = $storageFailures + 1
                Add-Warning -Message ('rclone exited {0} for bucket {1} - that bucket may be incomplete.' -f $sync.ExitCode, $bucket)
            }
            else {
                $storageBucketsSynced = $storageBucketsSynced + $bucket
            }
        }
        $storageSynced = $true
    }
    finally {
        Remove-Item Env:\RCLONE_CONFIG_NDTSUPA_TYPE              -ErrorAction SilentlyContinue
        Remove-Item Env:\RCLONE_CONFIG_NDTSUPA_PROVIDER          -ErrorAction SilentlyContinue
        Remove-Item Env:\RCLONE_CONFIG_NDTSUPA_ACCESS_KEY_ID     -ErrorAction SilentlyContinue
        Remove-Item Env:\RCLONE_CONFIG_NDTSUPA_SECRET_ACCESS_KEY -ErrorAction SilentlyContinue
        Remove-Item Env:\RCLONE_CONFIG_NDTSUPA_ENDPOINT          -ErrorAction SilentlyContinue
        Remove-Item Env:\RCLONE_CONFIG_NDTSUPA_REGION            -ErrorAction SilentlyContinue
    }
}

# ---------------------------------------------------------------------------
# Step 5 - manifest
# ---------------------------------------------------------------------------

Write-Log -Level 'STEP' -Message 'Step 5/8  Manifest'

Remove-Item -LiteralPath $queryDir -Recurse -Force -ErrorAction SilentlyContinue

$artifactNames = @('roles.sql', 'schema.sql', 'data.sql', 'history.sql', 'history-data.sql', 'storage-policies.sql')
$artifacts = New-Object System.Collections.ArrayList
foreach ($name in $artifactNames) {
    $path = Join-Path $backupDir $name
    if (-not (Test-Path -LiteralPath $path)) { continue }
    $item = Get-Item -LiteralPath $path
    $hash = Get-FileHash -LiteralPath $path -Algorithm SHA256
    [void]$artifacts.Add([pscustomobject]@{
        name        = [string]$name
        bytes       = [long]$item.Length
        sha256      = [string]$hash.Hash
        modifiedUtc = [string]$item.LastWriteTimeUtc.ToString('yyyy-MM-ddTHH:mm:ssZ')
    })
}

$storageLocalFiles = 0
$storageLocalBytes = 0
if (Test-Path -LiteralPath $storageDir) {
    $localItems = Get-ChildItem -LiteralPath $storageDir -Recurse -File -ErrorAction SilentlyContinue
    if ($null -ne $localItems) {
        $storageLocalFiles = @($localItems).Count
        foreach ($f in $localItems) { $storageLocalBytes = $storageLocalBytes + $f.Length }
    }
}

function ConvertFrom-JsonOrNull {
    param([string] $Text)
    if ([string]::IsNullOrWhiteSpace($Text)) { return $null }
    try { return (ConvertFrom-Json -InputObject ([string]$Text)) }
    catch { return $null }
}

$warningsArray = @()
foreach ($w in $script:Warnings) { $warningsArray = $warningsArray + [string]$w }

$manifest = [pscustomobject]@{
    formatVersion = 1
    createdAtUtc  = [string](Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    dateKey       = [string]$dateKey
    projectRef    = [string]$ProjectRef
    machine       = [string]$env:COMPUTERNAME
    tooling       = [pscustomobject]@{
        supabase = [string]$supabaseCmd
        docker   = [string]$dockerCmd
        rclone   = [string]$rcloneCmd
        sevenZip = [string]$sevenZip
    }
    artifacts     = @($artifacts)
    database      = [pscustomobject]@{
        rowCounts            = (ConvertFrom-JsonOrNull -Text $rowCounts)
        policyCounts         = (ConvertFrom-JsonOrNull -Text $policyCount)
        migrationLedgerRows  = [string]$historyRows
    }
    storage       = [pscustomobject]@{
        synced        = [bool]$storageSynced
        target        = [string]$storageTarget   # aws-s3 | local | none
        buckets       = @($storageBucketsSynced)
        remoteStats   = (ConvertFrom-JsonOrNull -Text $bucketStats)
        localFileCount = [int]$storageLocalFiles
        localBytes     = [long]$storageLocalBytes
    }
    warnings      = @($warningsArray)
}

# [string] cast before ConvertTo-Json is the documented PS 5.1 scar: ETS-decorated strings
# serialize as objects. Every scalar above is already cast; the cast here guards the write.
$manifestJson = [string](ConvertTo-Json -InputObject $manifest -Depth 8)
$manifestPath = Join-Path $backupDir 'manifest.json'
Write-Utf8File -Path $manifestPath -Content $manifestJson
Write-Log -Level 'OK' -Message ('  manifest.json ({0} artifacts)' -f $artifacts.Count)

$logPath = Join-Path $backupDir 'backup.log'
Write-Utf8File -Path $logPath -Content (($script:LogLines -join "`r`n") + "`r`n")

# ---------------------------------------------------------------------------
# Step 6 - encryption
# ---------------------------------------------------------------------------

Write-Log -Level 'STEP' -Message 'Step 6/8  Encryption'

$encrypted = $false
if ($NoEncrypt) {
    Write-Log -Level 'INFO' -Message '  skipped (-NoEncrypt)'
    Add-Warning -Message 'Backup left PLAINTEXT by -NoEncrypt. data.sql holds production PII and password hashes.'
}
elseif ($null -eq $sevenZip) {
    Write-Log -Level 'FAIL' -Message '  ############################################################'
    Write-Log -Level 'FAIL' -Message '  7-Zip is NOT installed. The backup is PLAINTEXT on disk.'
    Write-Log -Level 'FAIL' -Message '  data.sql contains production PII and password hashes.'
    Write-Log -Level 'FAIL' -Message '  Encrypt it manually - see docs/processes/backup-and-restore.md'
    Write-Log -Level 'FAIL' -Message '  ############################################################'
    Add-Warning -Message '7-Zip absent - backup set left plaintext, manual encryption required.'
}
elseif ([string]::IsNullOrWhiteSpace($passphrase)) {
    Write-Log -Level 'FAIL' -Message '  NDT_BACKUP_PASSPHRASE is not set - refusing to create an unprotected archive.'
    Write-Log -Level 'FAIL' -Message '  The backup is PLAINTEXT on disk. Set the passphrase in the secrets file and re-run.'
    Add-Warning -Message 'No archive passphrase - backup set left plaintext.'
}
else {
    Write-Log -Level 'INFO' -Message ('  creating {0}' -f $archivePath)
    if (Test-Path -LiteralPath $archivePath) { Remove-Item -LiteralPath $archivePath -Force }

    # -mhe=on encrypts the header too (filenames hidden). 7z encryption is AES-256.
    $add = Invoke-Native -Exe $sevenZip -Arguments @(
        'a', '-t7z', '-mx=5', '-mhe=on', ('-p{0}' -f $passphrase), $archivePath, (Join-Path $backupDir '*')
    )
    $addExit = $add.ExitCode

    if ($addExit -ne 0 -or -not (Test-Path -LiteralPath $archivePath)) {
        Write-NativeOutput -Lines $add.Output
        Write-Log -Level 'FAIL' -Message ('  7-Zip failed (exit {0}). Plaintext folder kept.' -f $addExit)
        Add-Warning -Message '7-Zip archive creation failed - plaintext folder kept.'
    }
    else {
        $verify = Invoke-Native -Exe $sevenZip -Arguments @('t', ('-p{0}' -f $passphrase), $archivePath)
        $testExit = $verify.ExitCode
        if ($testExit -ne 0) {
            Write-Log -Level 'FAIL' -Message ('  archive verification failed (exit {0}). Plaintext folder kept.' -f $testExit)
            Add-Warning -Message '7-Zip archive failed verification - plaintext folder kept.'
        }
        else {
            $archiveHash = Get-FileHash -LiteralPath $archivePath -Algorithm SHA256
            $archiveSize = (Get-Item -LiteralPath $archivePath).Length
            Write-Log -Level 'OK' -Message ('  archive verified: {0:N0} bytes, sha256 {1}' -f $archiveSize, $archiveHash.Hash)

            # Manifest SIDECAR. manifest.json is sealed inside the archive, which is exactly
            # where Gate 0 of the restore needs it - but it cannot describe the archive that
            # contains it. The sidecar is that same manifest plus an "archive" block carrying
            # the .7z's own sha256, so a set fetched from S3 can be proven intact BEFORE the
            # passphrase is used. It is also the only readable index of what a given day's
            # archive holds: metadata only, no PII and no credentials.
            Add-Member -InputObject $manifest -NotePropertyName 'archive' -NotePropertyValue ([pscustomobject]@{
                name        = [string]$archiveName
                bytes       = [long]$archiveSize
                sha256      = [string]$archiveHash.Hash
                encryption  = '7z AES-256, encrypted headers (-mhe=on)'
            }) -Force
            Add-Member -InputObject $manifest -NotePropertyName 'offsite' -NotePropertyValue ([pscustomobject]@{
                remote      = [string]$AwsRemote
                bucket      = [string]$AwsBucket
                region      = [string]$AwsRegion
                archiveKey  = [string]$archiveKey
                manifestKey = [string]$manifestKey
                storagePrefix = [string]('{0}/storage' -f $KeyPrefix)
            }) -Force

            $sidecarJson = [string](ConvertTo-Json -InputObject $manifest -Depth 8)
            Write-Utf8File -Path $sidecarPath -Content $sidecarJson
            Write-Log -Level 'OK' -Message ('  manifest sidecar: {0}' -f $sidecarPath)

            Remove-Item -LiteralPath $backupDir -Recurse -Force
            Write-Log -Level 'OK' -Message '  plaintext folder removed'
            $encrypted = $true
        }
    }
}

# ---------------------------------------------------------------------------
# Step 7 - off-site upload (AWS S3)
#
# Ordering is the whole point of this step: the archive is already sealed and 7z-verified, the
# upload happens next, the remote listing is checked, and ONLY THEN is local retention allowed
# to delete anything. Local disk is a cache; deleting from it before the durable copy is
# confirmed would turn a transient network failure into data loss.
# ---------------------------------------------------------------------------

Write-Log -Level 'STEP' -Message 'Step 7/8  Off-site upload (AWS S3)'

$uploadAttempted = $false
$uploadOk        = $false
$uploadSkipped   = $false

function Write-SkipBanner {
    param([string[]] $Reasons)
    Write-Log -Level 'WARN' -Message '  ############################################################'
    Write-Log -Level 'WARN' -Message '  OFF-SITE UPLOAD SKIPPED - this backup exists on ONE machine.'
    foreach ($r in $Reasons) { Write-Log -Level 'WARN' -Message ('    - {0}' -f $r) }
    Write-Log -Level 'WARN' -Message '  Setup runbook: docs/processes/aws-backup-setup.md'
    Write-Log -Level 'WARN' -Message '  ############################################################'
}

if ($SkipUpload) {
    $uploadSkipped = $true
    Write-SkipBanner -Reasons @('-SkipUpload was supplied')
    Add-Warning -Message 'Off-site upload skipped by -SkipUpload. The only copy of this set is on local disk.'
}
elseif (-not $encrypted) {
    # Client-side encryption is a precondition, not a nicety. An unsealed set carries
    # production PII and password hashes and is never sent to a bucket.
    $uploadSkipped = $true
    Write-SkipBanner -Reasons @('there is no verified encrypted archive - plaintext is NEVER uploaded')
    Add-Warning -Message 'Off-site upload skipped: no verified encrypted archive. Fix the encryption step, then re-run.'
}
elseif (-not $offsiteConfigured) {
    $uploadSkipped = $true
    $reasons = @()
    foreach ($m in $offsiteMissing) { $reasons = $reasons + [string]$m }
    Write-SkipBanner -Reasons $reasons
    Add-Warning -Message ('Off-site upload skipped: destination not configured ({0}).' -f ($reasons -join '; '))
}
else {
    $uploadAttempted = $true
    Write-Log -Level 'INFO' -Message ('  remote    : {0}:' -f $AwsRemote)
    Write-Log -Level 'INFO' -Message ('  bucket    : {0}' -f $AwsBucket)
    Write-Log -Level 'INFO' -Message ('  partition : {0}' -f $partitionPrefix)

    $archiveDest  = Get-AwsRemoteSpec -Remote $AwsRemote -Region $AwsRegion -Path ('{0}/{1}' -f $AwsBucket, $archiveKey)
    $manifestDest = Get-AwsRemoteSpec -Remote $AwsRemote -Region $AwsRegion -Path ('{0}/{1}' -f $AwsBucket, $manifestKey)
    $listDest     = Get-AwsRemoteSpec -Remote $AwsRemote -Region $AwsRegion -Path ('{0}/{1}' -f $AwsBucket, $partitionPrefix)

    # copyto, not sync: one named source file to one named destination key. sync would need
    # delete rights the writer policy does not have, and must never be pointed at a bucket
    # holding history.
    #
    # --no-check-dest skips rclone's "does the destination already exist" HeadObject. Without
    # GetObject that probe is a 403 whenever the key IS present, which would make any same-day
    # re-run fail. Bucket versioning (required by the setup runbook) means a repeat PUT adds a
    # version rather than destroying anything, so skipping the probe is safe here.
    $uploadFailure = $null

    Write-Log -Level 'INFO' -Message ('  uploading {0}' -f $archiveName)
    $putArchive = Invoke-Native -Exe 'rclone' -Arguments @(
        'copyto', $archivePath, $archiveDest, '--no-check-dest', '--stats-one-line', '--stats', '30s'
    )
    Write-NativeOutput -Lines $putArchive.Output
    if ($putArchive.ExitCode -ne 0) { $uploadFailure = ('rclone copyto exited {0} for the archive' -f $putArchive.ExitCode) }

    if ($null -eq $uploadFailure) {
        Write-Log -Level 'INFO' -Message ('  uploading {0}' -f $manifestName)
        $putManifest = Invoke-Native -Exe 'rclone' -Arguments @(
            'copyto', $sidecarPath, $manifestDest, '--no-check-dest', '--stats-one-line', '--stats', '30s'
        )
        Write-NativeOutput -Lines $putManifest.Output
        if ($putManifest.ExitCode -ne 0) { $uploadFailure = ('rclone copyto exited {0} for the manifest' -f $putManifest.ExitCode) }
    }

    if ($null -eq $uploadFailure) {
        # Remote verification is a LISTING check: name plus byte size for both objects. It is
        # deliberately not a content hash, because the writer credentials have no GetObject -
        # that is the point of a write-only backup identity. Content integrity is proven at
        # restore time, when the read credentials fetch the archive and its sha256 is checked
        # against archive.sha256 in the manifest. Do not "improve" this into rclone check:
        # that needs read access and would force the writer policy wider.
        Write-Log -Level 'INFO' -Message '  verifying remote listing'
        $ls = Invoke-Native -Exe 'rclone' -Arguments @('lsjson', $listDest)
        if ($ls.ExitCode -ne 0) {
            Write-NativeOutput -Lines $ls.Output
            $uploadFailure = ('rclone lsjson exited {0} - upload could not be verified' -f $ls.ExitCode)
        }
        else {
            $entries = ConvertFrom-RcloneJson -Lines $ls.Output
            if ($null -eq $entries) {
                $uploadFailure = 'remote listing was unreadable - upload could not be verified'
            }
            else {
                $localArchiveSize  = (Get-Item -LiteralPath $archivePath).Length
                $localManifestSize = (Get-Item -LiteralPath $sidecarPath).Length
                $seenArchive  = $false
                $seenManifest = $false
                foreach ($e in $entries) {
                    if ([string]$e.Name -eq $archiveName -and [long]$e.Size -eq [long]$localArchiveSize)   { $seenArchive = $true }
                    if ([string]$e.Name -eq $manifestName -and [long]$e.Size -eq [long]$localManifestSize) { $seenManifest = $true }
                }
                if (-not $seenArchive)  { $uploadFailure = ('{0} is absent from the remote partition, or its size differs' -f $archiveName) }
                elseif (-not $seenManifest) { $uploadFailure = ('{0} is absent from the remote partition, or its size differs' -f $manifestName) }
            }
        }
    }

    if ($null -eq $uploadFailure) {
        $uploadOk = $true
        Write-Log -Level 'OK' -Message ('  off-site copy verified: s3://{0}/{1}' -f $AwsBucket, $archiveKey)
        Write-Log -Level 'OK' -Message ('                          s3://{0}/{1}' -f $AwsBucket, $manifestKey)
    }
    else {
        Write-Log -Level 'FAIL' -Message '  ############################################################'
        Write-Log -Level 'FAIL' -Message ('  OFF-SITE UPLOAD FAILED: {0}' -f $uploadFailure)
        Write-Log -Level 'FAIL' -Message '  The local set is INTACT and nothing will be pruned.'
        Write-Log -Level 'FAIL' -Message '  Fix the destination and re-run; a re-run re-uploads the same keys.'
        Write-Log -Level 'FAIL' -Message '  ############################################################'
        Add-Warning -Message ('Off-site upload failed: {0}' -f $uploadFailure)
    }
}

# ---------------------------------------------------------------------------
# Step 8 - local retention
# ---------------------------------------------------------------------------

$effectiveKeep = $RetentionCount
$prunePermitted = $true

if ($uploadOk) {
    # The durable copy is off-site, so local depth is only about restore convenience.
    $effectiveKeep = $LocalCacheCount
}
elseif ($uploadAttempted) {
    # Attempted and failed. Never trade a local set for a remote copy that is not there.
    $prunePermitted = $false
}

Write-Log -Level 'STEP' -Message ('Step 8/8  Local retention (keep {0} most recent sets)' -f $effectiveKeep)

if (-not $prunePermitted) {
    Write-Log -Level 'WARN' -Message '  PRUNING SUPPRESSED - the off-site upload failed, so every local set is kept.'
}
else {
    if ($uploadOk) { Write-Log -Level 'INFO' -Message '  local is a CACHE this run (the durable copy is in S3)' }
    else           { Write-Log -Level 'INFO' -Message '  local is the DURABLE store this run (no off-site copy was made)' }

    $sets = Get-BackupSets -Root $outputFull
    $doomed = Get-PruneTargets -Sets $sets -KeepKey $dateKey -Keep $effectiveKeep
    if ($doomed.Count -eq 0) {
        Write-Log -Level 'INFO' -Message '  nothing to prune'
    }
    else {
        foreach ($p in $doomed) {
            try {
                Remove-Item -LiteralPath $p -Recurse -Force
                Write-Log -Level 'OK' -Message ('  pruned {0}' -f $p)
            }
            catch {
                Add-Warning -Message ('Failed to prune {0}: {1}' -f $p, $_.Exception.Message)
            }
        }
    }
}

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

Write-Host ''
Write-Log -Level 'STEP' -Message '=== Summary ==='
if ($encrypted) { Write-Log -Level 'OK'   -Message ('Local set  : {0} (encrypted)' -f $archivePath) }
else            { Write-Log -Level 'WARN' -Message ('Local set  : {0} (PLAINTEXT)' -f $backupDir) }
Write-Log -Level 'INFO' -Message ('Artifacts  : {0}' -f $artifacts.Count)

# Report by destination. With the direct Supabase -> AWS path there are no local storage files by
# design, so the local file/byte counters would read "0 files, 0 bytes" and look like a failure.
if ($storageTarget -eq 'aws-s3') {
    Write-Log -Level 'INFO' -Message ('Storage    : mirrored to S3, {0} bucket(s) ok, {1} failed (no local staging by design)' -f @($storageBucketsSynced).Count, $storageFailures)
}
elseif ($storageTarget -eq 'local') {
    Write-Log -Level 'INFO' -Message ('Storage    : local, {0} bucket(s) ok, {1} failed, {2} files, {3:N0} bytes' -f @($storageBucketsSynced).Count, $storageFailures, $storageLocalFiles, $storageLocalBytes)
}
else {
    Write-Log -Level 'WARN' -Message 'Storage    : object bytes NOT backed up this run'
}

if ($uploadOk) {
    Write-Log -Level 'OK' -Message ('Off-site   : s3://{0}/{1} (verified)' -f $AwsBucket, $archiveKey)
}
elseif ($uploadAttempted) {
    Write-Log -Level 'FAIL' -Message 'Off-site   : FAILED - this set exists on one machine only.'
}
else {
    Write-Log -Level 'WARN' -Message 'Off-site   : SKIPPED - this set exists on one machine only.'
}

if ($script:Warnings.Count -gt 0) {
    Write-Log -Level 'WARN' -Message ('{0} warning(s):' -f $script:Warnings.Count)
    foreach ($w in $script:Warnings) { Write-Log -Level 'WARN' -Message ('  - {0}' -f $w) }
}

# Exit-code contract (documented in docs/processes/backup-and-restore.md):
#   0 fully backed up  1 warnings, off-site copy exists  2 refused to start  3 dump failed
#   4 backed up LOCALLY ONLY (off-site skipped)          5 off-site upload FAILED
# Most specific wins: a failed upload outranks a skip, which outranks ordinary warnings.
if ($uploadAttempted -and -not $uploadOk) {
    Write-Log -Level 'FAIL' -Message 'Result: OFF-SITE UPLOAD FAILED (exit 5). Local set retained in full.'
    exit 5
}
if ($uploadSkipped) {
    Write-Log -Level 'WARN' -Message 'Result: BACKED UP LOCALLY ONLY (exit 4). No off-site copy of this set exists.'
    exit 4
}
if ($script:Warnings.Count -gt 0) {
    Write-Log -Level 'WARN' -Message 'Result: fully backed up, with warnings (exit 1).'
    exit 1
}
Write-Log -Level 'OK' -Message 'Result: fully backed up - local set and verified off-site copy (exit 0).'
exit 0
