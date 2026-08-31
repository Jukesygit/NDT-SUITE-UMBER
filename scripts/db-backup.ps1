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
                                 With that stage dormant they fall back to LOCAL staging inside
                                 the day folder, which means they are sealed into the .7z and
                                 published with it - a ~1.4 GB archive into the library every
                                 week. rclone is not installed today, so no object-byte copy is
                                 taken at all and the ~1.37 GB has NO second copy anywhere.
                                 Decide that deliberately before installing rclone.
      8. manifest.json         - sha256 + byte size + timestamps per artifact, plus row
                                 counts / policy counts / per-bucket object counts when a
                                 query path is available.

    DURABLE DESTINATION - PUBLISH TO ONEDRIVE FOR BUSINESS (owner decision 2026-08-31)

    Local disk is a working CACHE, not the durable store. The durable copy is a file in the
    Company OneDrive / SharePoint library, published after the archive is sealed:

        <publish dir>\db\YYYY\ndt-backup-YYYY-MM-DD.7z
        <publish dir>\db\YYYY\ndt-backup-YYYY-MM-DD.manifest.json

    CIPHERTEXT ONLY IN THE SYNCED FOLDER. This is the load-bearing invariant of the whole
    stage. Plaintext dumps stage in -OutputRoot, which is NOT synced (the script still refuses
    to start if that root looks OneDrive-backed), and NOTHING is written under the publish
    directory until the .7z has been sealed AND 7z-verified: no temp file, no partial manifest,
    no in-progress marker. The first and only bytes that ever appear there are a finished
    archive and its metadata sidecar.

    The library is SHARED. Other site members can see the file, so confidentiality rests
    entirely on the archive passphrase - which is exactly why the encryption step is a
    precondition and not a finishing touch.

    Non-negotiables, enforced here rather than trusted to the operator:

      * The .7z is sealed AND 7z-verified BEFORE anything leaves the cache. -NoEncrypt, a
        missing 7-Zip and a missing passphrase each SKIP the publish rather than putting
        plaintext PII into a synced folder.
      * The published archive is RE-HASHED at the destination and compared against the
        manifest's archive sha256. A silent sync-client corruption or a partial copy fails
        loudly instead of passing for a backup.
      * Local pruning happens ONLY AFTER the publish is verified. A failed publish prunes
        nothing and exits non-zero.
      * Destination retention (keep 8 published sets, two months of weeklies) also runs ONLY
        after a verified publish. The library has no lifecycle rules, so this script owns
        expiry there; OneDrive version history and the recycle bin are the recovery net.

    OFF-SITE STAGE (AWS S3) - DORMANT since 2026-08-31, kept as the ready alternative

    The S3 stage below still works and still runs FIRST-CLASS when it is configured, but it is
    no longer the default durable hop and its absence is no longer a failure: a run that
    publishes successfully exits 0 whether or not S3 is set up. Its non-negotiables are
    unchanged - sealed-and-verified before upload, write-only Put/List credentials so this
    script issues no deletes and no overwrites, `rclone copy` (never `sync`) for the storage
    mirror, and server-side encryption from the bucket default.

    EXIT CODES
      0  fully backed up   - local set created, archive + manifest published and re-hash verified
      1  completed with warnings (a durable copy exists; read the warnings)
      2  refused to start  - configuration / credentials / unsafe output root
      3  a dump failed
      4  backed up LOCALLY ONLY - no durable copy was made (see the SKIP banner)
      5  publish or off-site upload FAILED - local set left intact, NOTHING pruned

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
        $env:NDT_BACKUP_S3_BUCKET    = "<AWS destination bucket name>"     # dormant S3 stage
        $env:NDT_BACKUP_S3_REGION    = "<AWS destination bucket region>"   # dormant S3 stage

    Read that block carefully: NDT_BACKUP_S3_KEY / _SECRET are the Supabase SOURCE keys, while
    NDT_BACKUP_S3_BUCKET / _REGION describe the AWS DESTINATION. The AWS keys themselves are
    deliberately NOT here - they live in the rclone remote (see -AwsRemote), which is the one
    credential store for the off-site stage.

    The publish destination needs NO entry here: -PublishDir defaults to the owner's library
    path, and $env:NDT_BACKUP_PUBLISH_DIR is an optional override for another machine. It is a
    path, not a credential.

.PARAMETER OutputRoot
    Backup root, and the ONLY place plaintext dumps are ever written. Default
    C:\Users\jonas\ndt-backups. MUST be outside the repository and outside any OneDrive-synced
    tree: data.sql carries production PII and password hashes. Once a set is published this is
    a CACHE, not the durable store.

.PARAMETER PublishDir
    Durable destination for the sealed archive and its manifest sidecar - a OneDrive for
    Business / SharePoint library folder. Default:

        C:\Users\jonas\OneDrive - Matrix\Matrix IMS - Documents\DB Backup

    Overridable with $env:NDT_BACKUP_PUBLISH_DIR or this parameter. Files land in a year
    subfolder (<dir>\db\YYYY\) so the library stays browsable. If the directory does not exist
    the publish SKIPs with a banner and the run reports "backed up locally only" (exit 4) - it
    is never created, because an absent path means OneDrive is not set up on this machine
    rather than "make a folder here".

.PARAMETER PublishRetentionCount
    Published sets kept in the destination. Default 8 (two months of weeklies). The library has
    no lifecycle rules, so this script owns expiry there. Pruning runs only after a verified
    publish; OneDrive version history and the recycle bin are the recovery net.

.PARAMETER SkipPublish
    Run the local backup and skip the publish step entirely. Exits 4 unless the S3 stage is
    configured and succeeds.

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
    Local sets kept when NO durable copy was made. Local is then the durable store, so the
    historic depth of 4 applies. Default 4.

.PARAMETER LocalCacheCount
    Local sets kept once a durable copy (publish, or the dormant S3 upload) is verified. Local
    is then only a cache. Default 2.

.PARAMETER SkipUpload
    Skip the dormant off-site S3 stage. Harmless while S3 is unconfigured; a publish still
    makes the run a full backup.

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

    # --- durable destination (OneDrive for Business) ---
    # Empty by default so the resolution order below can be stated once: parameter, then
    # $env:NDT_BACKUP_PUBLISH_DIR (which the secrets file may set), then the owner's library.
    [string] $PublishDir,
    [ValidateRange(1, 3650)]
    [int]    $PublishRetentionCount = 8,
    [switch] $SkipPublish,

    # --- off-site stage (AWS S3), dormant since 2026-08-31 ---
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
# Publish helpers (OneDrive for Business destination)
#
# Layout is <publish dir>\db\YYYY\ndt-backup-YYYY-MM-DD.7z (+ .manifest.json). The year
# subfolder is cheap partitioning: it keeps a shared document library browsable by a human and
# bounds the number of children per folder, which is what SharePoint sync is happiest with.
# Kept identical in scripts/db-restore.ps1 - the two scripts address this layout from opposite
# directions, so if one changes, change the other in the same commit.
# ---------------------------------------------------------------------------

function Get-PublishSetPaths {
    param(
        [Parameter(Mandatory = $true)][string] $Root,
        [Parameter(Mandatory = $true)][string] $DateKey
    )
    $year = ($DateKey -split '-')[0]
    $yearDir = Join-Path (Join-Path $Root 'db') $year
    return [pscustomobject]@{
        YearDir  = [string]$yearDir
        Archive  = [string](Join-Path $yearDir ('ndt-backup-{0}.7z' -f $DateKey))
        Manifest = [string](Join-Path $yearDir ('ndt-backup-{0}.manifest.json' -f $DateKey))
    }
}

function Get-PublishedSets {
    # dateKey -> every published file belonging to that set, across all year folders. A set is
    # pruned as a unit, exactly like the local cache: an orphaned sidecar indexing an archive
    # that is gone is worse than no index at all.
    param([Parameter(Mandatory = $true)][string] $Root)
    $sets = @{}
    $dbRoot = Join-Path $Root 'db'
    if (-not (Test-Path -LiteralPath $dbRoot)) { return $sets }

    $files = Get-ChildItem -LiteralPath $dbRoot -File -Recurse -ErrorAction SilentlyContinue
    foreach ($file in $files) {
        $key = $null
        if ($file.Name -match '^ndt-backup-(\d{4}-\d{2}-\d{2})\.7z$')            { $key = $Matches[1] }
        elseif ($file.Name -match '^ndt-backup-(\d{4}-\d{2}-\d{2})\.manifest\.json$') { $key = $Matches[1] }
        if ($null -eq $key) { continue }
        if (-not $sets.ContainsKey($key)) { $sets[$key] = New-Object System.Collections.ArrayList }
        [void]$sets[$key].Add($file.FullName)
    }
    return $sets
}

# ---------------------------------------------------------------------------
# rclone helpers (dormant off-site stage)
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

# Publish destination: -PublishDir, then the environment (the secrets file may set it on another
# machine), then the owner's library. A path, not a credential - so the default is here in the
# open and no secrets-file edit is needed to turn the stage on.
$DefaultPublishDir = 'C:\Users\jonas\OneDrive - Matrix\Matrix IMS - Documents\DB Backup'
if ([string]::IsNullOrWhiteSpace($PublishDir)) { $PublishDir = $env:NDT_BACKUP_PUBLISH_DIR }
if ([string]::IsNullOrWhiteSpace($PublishDir)) { $PublishDir = $DefaultPublishDir }

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
# Publish destination (OneDrive for Business) - resolved once, reported the same way by the dry
# run and the real run.
# ---------------------------------------------------------------------------

$publishFull  = [System.IO.Path]::GetFullPath($PublishDir)
$publishPaths = Get-PublishSetPaths -Root $publishFull -DateKey $dateKey

$publishMissing = New-Object System.Collections.ArrayList
if (-not (Test-Path -LiteralPath $publishFull)) {
    [void]$publishMissing.Add(('publish directory "{0}" does not exist - OneDrive is not set up on this machine, or that library is not synced yet' -f $publishFull))
}

# The two roots must not overlap, in either direction. -OutputRoot is where PLAINTEXT dumps are
# staged; the publish directory is synced to a shared library. Nesting one inside the other
# would break the ciphertext-only invariant one way and the "dumps never touch cloud sync" rule
# the other. Compare with a trailing separator so "C:\a" is not treated as a parent of "C:\ab".
$outputCompare  = $outputFull.TrimEnd('\') + '\'
$publishCompare = $publishFull.TrimEnd('\') + '\'
$repoCompare    = $repoRoot.TrimEnd('\') + '\'
if ($publishCompare.StartsWith($outputCompare, [System.StringComparison]::OrdinalIgnoreCase) -or
    $outputCompare.StartsWith($publishCompare, [System.StringComparison]::OrdinalIgnoreCase)) {
    [void]$publishMissing.Add(('publish directory "{0}" overlaps the plaintext staging root "{1}"' -f $publishFull, $outputFull))
}
if ($publishCompare.StartsWith($repoCompare, [System.StringComparison]::OrdinalIgnoreCase)) {
    [void]$publishMissing.Add(('publish directory "{0}" is inside the repository' -f $publishFull))
}
$publishConfigured = ($publishMissing.Count -eq 0)

# ---------------------------------------------------------------------------
# Off-site destination (AWS S3, dormant) - resolved once, reported the same way by dry run and
# real run
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
    Write-Log -Level 'PLAN' -Message ('Local retention : keep {0} sets when no durable copy is made / {1} sets once one is verified' -f $RetentionCount, $LocalCacheCount)

    Write-Host ''
    Write-Log -Level 'PLAN' -Message '--- Durable destination (OneDrive for Business) ---'
    Write-Log -Level 'PLAN' -Message ('  publish dir   : {0}' -f $publishFull)
    Write-Log -Level 'PLAN' -Message ('  archive       : {0}' -f $publishPaths.Archive)
    Write-Log -Level 'PLAN' -Message ('  manifest      : {0}' -f $publishPaths.Manifest)
    Write-Log -Level 'PLAN' -Message ('  keep          : {0} published set(s)' -f $PublishRetentionCount)
    Write-Log -Level 'PLAN' -Message '  CIPHERTEXT ONLY: nothing is written here until the .7z is sealed AND 7z-verified'
    if ($SkipPublish) {
        Write-Log -Level 'WARN' -Message '  -SkipPublish supplied - a real run would NOT publish'
    }
    elseif ($publishConfigured) {
        Write-Log -Level 'OK' -Message '  destination exists - a real run would publish and re-hash to verify'
    }
    else {
        Write-Log -Level 'WARN' -Message '  destination unusable - a real run would SKIP the publish:'
        foreach ($m in $publishMissing) { Write-Log -Level 'WARN' -Message ('    - {0}' -f $m) }
    }

    Write-Host ''
    Write-Log -Level 'PLAN' -Message '--- Off-site destination (AWS S3 - DORMANT, optional) ---'
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
        Write-Log -Level 'OK' -Message '  destination is configured - a real run would ALSO upload here'
    }
    else {
        Write-Log -Level 'INFO' -Message '  destination not configured - the S3 stage would SKIP (dormant since 2026-08-31):'
        foreach ($m in $offsiteMissing) { Write-Log -Level 'INFO' -Message ('    - {0}' -f $m) }
        Write-Log -Level 'INFO' -Message '  this alone does NOT mean exit 4 - a verified publish is a durable copy on its own'
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
    Write-Log -Level 'PLAN' -Message '--- Step 7: publish to OneDrive (the durable hop) ---'
    $planWouldPublish = $false
    if ($SkipPublish) {
        Write-Log -Level 'PLAN' -Message '  SKIPPED (-SkipPublish)'
    }
    elseif (-not $planWouldEncrypt) {
        Write-Log -Level 'PLAN' -Message '  SKIPPED - no verified encrypted archive would exist.'
        Write-Log -Level 'PLAN' -Message '  CIPHERTEXT ONLY: plaintext is NEVER copied into the synced library.'
    }
    elseif (-not $publishConfigured) {
        Write-Log -Level 'PLAN' -Message '  SKIPPED - destination unusable. A real run would exit 4 (backed up locally only):'
        foreach ($m in $publishMissing) { Write-Log -Level 'PLAN' -Message ('    - {0}' -f $m) }
    }
    else {
        $planWouldPublish = $true
        Write-Log -Level 'PLAN' -Message ('  mkdir  "{0}"   (year folder only - created after the archive is sealed)' -f $publishPaths.YearDir)
        Write-Log -Level 'PLAN' -Message ('  copy   "{0}"' -f $archivePath)
        Write-Log -Level 'PLAN' -Message ('      -> "{0}"' -f $publishPaths.Archive)
        Write-Log -Level 'PLAN' -Message ('  copy   "{0}"' -f $sidecarPath)
        Write-Log -Level 'PLAN' -Message ('      -> "{0}"' -f $publishPaths.Manifest)
        Write-Log -Level 'PLAN' -Message '  verify: Get-FileHash on the PUBLISHED .7z vs archive.sha256 in the manifest'
        Write-Log -Level 'PLAN' -Message '          (a partial copy or a sync-client corruption fails the run, exit 5)'
        Write-Log -Level 'PLAN' -Message '  no temp file, no partial manifest and no marker is ever written under the publish dir'
    }

    Write-Host ''
    Write-Log -Level 'PLAN' -Message '--- Step 8: off-site upload (AWS S3 - DORMANT, runs only when configured) ---'
    if ($SkipUpload) {
        Write-Log -Level 'PLAN' -Message '  SKIPPED (-SkipUpload)'
    }
    elseif (-not $planWouldEncrypt) {
        Write-Log -Level 'PLAN' -Message '  SKIPPED - no verified encrypted archive would exist. Plaintext is NEVER uploaded.'
    }
    elseif (-not $offsiteConfigured) {
        Write-Log -Level 'PLAN' -Message '  SKIPPED - destination not configured (dormant stage):'
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
    Write-Log -Level 'PLAN' -Message ('--- Step 9a: destination retention (keep {0} published sets) ---' -f $PublishRetentionCount)
    if (-not $planWouldPublish) {
        Write-Log -Level 'PLAN' -Message '  SKIPPED - destination pruning only ever runs after a VERIFIED publish'
    }
    elseif (-not (Test-Path -LiteralPath (Join-Path $publishFull 'db'))) {
        Write-Log -Level 'PLAN' -Message '  nothing published there yet - nothing to prune'
    }
    else {
        $planPublished = Get-PublishedSets -Root $publishFull
        $planPubDoomed = Get-PruneTargets -Sets $planPublished -KeepKey $dateKey -Keep $PublishRetentionCount
        if ($planPubDoomed.Count -eq 0) {
            Write-Log -Level 'PLAN' -Message ('  {0} published set(s) present - nothing to prune' -f $planPublished.Count)
        }
        else {
            foreach ($p in $planPubDoomed) { Write-Log -Level 'PLAN' -Message ('  would DELETE {0}' -f $p) }
        }
        Write-Log -Level 'PLAN' -Message '  deletions there are recoverable through OneDrive version history / the recycle bin'
    }

    Write-Host ''
    Write-Log -Level 'PLAN' -Message '--- Step 9b: local retention ---'
    $planWouldUpload = ($planWouldEncrypt -and $offsiteConfigured -and -not $SkipUpload)
    $planKeep = $RetentionCount
    if ($planWouldPublish -or $planWouldUpload) {
        $planKeep = $LocalCacheCount
        $planWhere = 'the OneDrive library'
        if (-not $planWouldPublish) { $planWhere = 'S3' }
        Write-Log -Level 'PLAN' -Message ('  keep {0} (local is a CACHE - the durable copy is in {1})' -f $planKeep, $planWhere)
        Write-Log -Level 'PLAN' -Message '  if the publish or the upload FAILED it would keep everything and exit 5 instead'
    }
    else {
        Write-Log -Level 'PLAN' -Message ('  keep {0} (local is the DURABLE store this run - no publish, no off-site copy)' -f $planKeep)
    }
    $sets = Get-BackupSets -Root $outputFull
    $doomed = Get-PruneTargets -Sets $sets -KeepKey $dateKey -Keep $planKeep
    if ($doomed.Count -eq 0) {
        Write-Log -Level 'PLAN' -Message '  nothing to prune'
    }
    else {
        foreach ($p in $doomed) { Write-Log -Level 'PLAN' -Message ('  would DELETE {0}' -f $p) }
    }
    Write-Log -Level 'PLAN' -Message '  objects in S3 are never deleted by this script (lifecycle rules own that)'

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

Write-Log -Level 'STEP' -Message 'Step 1/9  Logical dumps (5-part sequence)'

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

Write-Log -Level 'STEP' -Message 'Step 2/9  Storage policy catalog capture'

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

Write-Log -Level 'STEP' -Message 'Step 3/9  Database state capture'

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

Write-Log -Level 'STEP' -Message 'Step 4/9  Storage object bytes'

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

Write-Log -Level 'STEP' -Message 'Step 5/9  Manifest'

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

Write-Log -Level 'STEP' -Message 'Step 6/9  Encryption'

$encrypted = $false
# Captured at seal time and consumed by the publish step: the destination copy is re-hashed
# against THIS value, so the number the publish proves is the number the archive was sealed with.
$archiveSha256 = $null
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
            $archiveSha256 = [string]$archiveHash.Hash
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
# Step 7 - publish to the OneDrive for Business library (the durable hop)
#
# THE CIPHERTEXT-ONLY INVARIANT LIVES HERE, and this is the comment that states it.
#
# Everything before this step writes into $OutputRoot, which is NOT cloud-synced (the script
# refuses to start if it looks like it is). Everything this step writes goes into a SHARED,
# SYNCED document library. The gate between the two is $encrypted, which is true only after
# 7-Zip produced the archive AND `7z t` verified it - at which point the plaintext day folder
# has already been deleted. So the first and only bytes that ever appear under the publish
# directory are a finished AES-256 archive and its metadata sidecar: no temp file, no partial
# manifest, no in-progress marker, no plaintext, not even a placeholder folder.
#
# Anything that stages work under $publishFull before this gate breaks the arrangement, because
# the library is visible to site members who are not entitled to production personal data.
# Confidentiality there rests on the archive passphrase and on nothing else.
#
# The copy is then RE-HASHED at the destination against the sha256 taken when the archive was
# sealed. A sync client that truncates a file, or a copy that half-finishes, has to fail the run
# rather than pass for a backup. Only a verified publish permits any pruning, here or locally.
# ---------------------------------------------------------------------------

Write-Log -Level 'STEP' -Message 'Step 7/9  Publish to OneDrive (durable copy)'

$publishAttempted = $false
$publishOk        = $false
$publishSkipped   = $false

function Write-PublishSkipBanner {
    param([string[]] $Reasons)
    Write-Log -Level 'WARN' -Message '  ############################################################'
    Write-Log -Level 'WARN' -Message '  PUBLISH SKIPPED - no durable copy was made in the library.'
    foreach ($r in $Reasons) { Write-Log -Level 'WARN' -Message ('    - {0}' -f $r) }
    Write-Log -Level 'WARN' -Message '  Process: docs/processes/backup-and-restore.md'
    Write-Log -Level 'WARN' -Message '  ############################################################'
}

if ($SkipPublish) {
    $publishSkipped = $true
    Write-PublishSkipBanner -Reasons @('-SkipPublish was supplied')
    Add-Warning -Message 'Publish skipped by -SkipPublish.'
}
elseif (-not $encrypted) {
    $publishSkipped = $true
    Write-PublishSkipBanner -Reasons @('there is no verified encrypted archive - plaintext is NEVER copied into a synced library')
    Add-Warning -Message 'Publish skipped: no verified encrypted archive. Fix the encryption step, then re-run.'
}
elseif (-not $publishConfigured) {
    $publishSkipped = $true
    $publishReasons = @()
    foreach ($m in $publishMissing) { $publishReasons = $publishReasons + [string]$m }
    Write-PublishSkipBanner -Reasons $publishReasons
    Add-Warning -Message ('Publish skipped: destination unusable ({0}).' -f ($publishReasons -join '; '))
}
else {
    $publishAttempted = $true
    Write-Log -Level 'INFO' -Message ('  destination : {0}' -f $publishPaths.YearDir)

    $publishFailure = $null
    try {
        [void](New-Item -ItemType Directory -Path $publishPaths.YearDir -Force)
    }
    catch {
        $publishFailure = ('could not create the year folder: {0}' -f $_.Exception.Message)
    }

    if ($null -eq $publishFailure) {
        Write-Log -Level 'INFO' -Message ('  copying {0}' -f $archiveName)
        try { Copy-Item -LiteralPath $archivePath -Destination $publishPaths.Archive -Force }
        catch { $publishFailure = ('archive copy failed: {0}' -f $_.Exception.Message) }
    }

    if ($null -eq $publishFailure) {
        Write-Log -Level 'INFO' -Message ('  copying {0}' -f $manifestName)
        try { Copy-Item -LiteralPath $sidecarPath -Destination $publishPaths.Manifest -Force }
        catch { $publishFailure = ('manifest sidecar copy failed: {0}' -f $_.Exception.Message) }
    }

    # A real content hash, not a name-and-size check. The S3 stage settles for a listing because
    # its write-only identity has no GetObject; here the destination is an ordinary path under a
    # sync client, so the bytes can be read straight back and there is no excuse for a weaker
    # check. This is the one thing standing between "the file is there" and "the file is right".
    if ($null -eq $publishFailure) {
        if (-not (Test-Path -LiteralPath $publishPaths.Archive)) {
            $publishFailure = 'the published archive is not there after the copy'
        }
        elseif ([string]::IsNullOrWhiteSpace($archiveSha256)) {
            $publishFailure = 'no sealed-archive sha256 to verify the published copy against'
        }
        else {
            $publishedHash = [string](Get-FileHash -LiteralPath $publishPaths.Archive -Algorithm SHA256).Hash
            if ($publishedHash -ne [string]$archiveSha256) {
                $publishFailure = ('sha256 mismatch at the destination: sealed {0}, published {1}' -f $archiveSha256, $publishedHash)
            }
        }
    }

    if ($null -eq $publishFailure) {
        if (-not (Test-Path -LiteralPath $publishPaths.Manifest)) {
            $publishFailure = 'the published manifest sidecar is not there after the copy'
        }
        else {
            $localSidecarSize     = (Get-Item -LiteralPath $sidecarPath).Length
            $publishedSidecarSize = (Get-Item -LiteralPath $publishPaths.Manifest).Length
            if ([long]$publishedSidecarSize -ne [long]$localSidecarSize) {
                $publishFailure = ('the published manifest sidecar is {0:N0} bytes, the local one {1:N0}' -f $publishedSidecarSize, $localSidecarSize)
            }
        }
    }

    if ($null -eq $publishFailure) {
        $publishOk = $true
        Write-Log -Level 'OK' -Message ('  published, re-hash verified: {0}' -f $publishPaths.Archive)
        Write-Log -Level 'OK' -Message ('                               {0}' -f $publishPaths.Manifest)
    }
    else {
        Write-Log -Level 'FAIL' -Message '  ############################################################'
        Write-Log -Level 'FAIL' -Message ('  PUBLISH FAILED: {0}' -f $publishFailure)
        Write-Log -Level 'FAIL' -Message '  The local set is INTACT and nothing will be pruned.'
        Write-Log -Level 'FAIL' -Message '  A partial file may be sitting at the destination. It is NOT deleted here'
        Write-Log -Level 'FAIL' -Message '  (evidence, and a restore would refuse it on the hash anyway) - a re-run'
        Write-Log -Level 'FAIL' -Message '  overwrites the same names. Check the library is synced and has space.'
        Write-Log -Level 'FAIL' -Message '  ############################################################'
        Add-Warning -Message ('Publish failed: {0}' -f $publishFailure)
    }
}

# ---------------------------------------------------------------------------
# Step 8 - off-site upload (AWS S3), DORMANT since 2026-08-31
#
# Unchanged in behaviour: it still runs whenever the destination is configured, and it still
# refuses to send anything that is not a sealed, verified archive. What changed is its standing.
# It is no longer the only durable hop, so its absence is a plain SKIP rather than the reason a
# run is "locally only" - that verdict is now the AND of this stage and the publish above.
#
# The ordering rule is unchanged and still load-bearing: seal, verify, copy off the machine,
# confirm, and only then let retention delete anything.
# ---------------------------------------------------------------------------

Write-Log -Level 'STEP' -Message 'Step 8/9  Off-site upload (AWS S3, dormant)'

$uploadAttempted = $false
$uploadOk        = $false
$uploadSkipped   = $false

function Write-SkipBanner {
    param([string[]] $Reasons)
    Write-Log -Level 'WARN' -Message '  ------------------------------------------------------------'
    Write-Log -Level 'WARN' -Message '  Off-site S3 upload skipped (this stage is dormant).'
    foreach ($r in $Reasons) { Write-Log -Level 'WARN' -Message ('    - {0}' -f $r) }
    Write-Log -Level 'WARN' -Message '  Setup runbook, if it is ever re-armed: docs/processes/aws-backup-setup.md'
    Write-Log -Level 'WARN' -Message '  ------------------------------------------------------------'
}

if ($SkipUpload) {
    $uploadSkipped = $true
    Write-SkipBanner -Reasons @('-SkipUpload was supplied')
}
elseif (-not $encrypted) {
    # Client-side encryption is a precondition, not a nicety. An unsealed set carries
    # production PII and password hashes and is never sent to a bucket.
    $uploadSkipped = $true
    Write-SkipBanner -Reasons @('there is no verified encrypted archive - plaintext is NEVER uploaded')
}
elseif (-not $offsiteConfigured) {
    $uploadSkipped = $true
    $reasons = @()
    foreach ($m in $offsiteMissing) { $reasons = $reasons + [string]$m }
    Write-SkipBanner -Reasons $reasons
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
# Step 9 - retention, at the destination and then locally
#
# One rule governs both halves: NOTHING is deleted anywhere until a durable copy of THIS set has
# been made and proven. A durable copy is a verified publish or a verified S3 upload; if either
# was attempted and failed, all pruning is suppressed, because trading a set on disk for a copy
# that is not there is how a transient failure becomes data loss.
# ---------------------------------------------------------------------------

$durableOk     = ($publishOk -or $uploadOk)
$durableFailed = (($publishAttempted -and -not $publishOk) -or ($uploadAttempted -and -not $uploadOk))

$effectiveKeep  = $RetentionCount
$prunePermitted = $true

if ($durableFailed)  { $prunePermitted = $false }
elseif ($durableOk)  { $effectiveKeep = $LocalCacheCount }

Write-Log -Level 'STEP' -Message ('Step 9/9  Retention (destination keep {0}, local keep {1})' -f $PublishRetentionCount, $effectiveKeep)

# --- destination -------------------------------------------------------------
# Only after a VERIFIED publish, and only in the library. The library has no lifecycle rules, so
# this script owns expiry there; OneDrive version history and the recycle bin are the net under
# it, which is why deleting here is acceptable where deleting in S3 (write-only, no delete right
# by design) is not.
if (-not $publishOk) {
    Write-Log -Level 'INFO' -Message '  destination: nothing pruned (no verified publish this run)'
}
else {
    $publishedSets = Get-PublishedSets -Root $publishFull
    $pubDoomed = Get-PruneTargets -Sets $publishedSets -KeepKey $dateKey -Keep $PublishRetentionCount
    if ($pubDoomed.Count -eq 0) {
        Write-Log -Level 'INFO' -Message ('  destination: {0} published set(s), nothing to prune' -f $publishedSets.Count)
    }
    else {
        foreach ($p in $pubDoomed) {
            try {
                Remove-Item -LiteralPath $p -Force
                Write-Log -Level 'OK' -Message ('  destination pruned {0}' -f $p)
            }
            catch {
                Add-Warning -Message ('Failed to prune published file {0}: {1}' -f $p, $_.Exception.Message)
            }
        }
    }
}

# --- local -------------------------------------------------------------------
if (-not $prunePermitted) {
    Write-Log -Level 'WARN' -Message '  local: PRUNING SUPPRESSED - a durable copy failed, so every local set is kept.'
}
else {
    if ($publishOk)     { Write-Log -Level 'INFO' -Message '  local is a CACHE this run (the durable copy is in the OneDrive library)' }
    elseif ($uploadOk)  { Write-Log -Level 'INFO' -Message '  local is a CACHE this run (the durable copy is in S3)' }
    else                { Write-Log -Level 'INFO' -Message '  local is the DURABLE store this run (no durable copy was made)' }

    $sets = Get-BackupSets -Root $outputFull
    $doomed = Get-PruneTargets -Sets $sets -KeepKey $dateKey -Keep $effectiveKeep
    if ($doomed.Count -eq 0) {
        Write-Log -Level 'INFO' -Message '  local: nothing to prune'
    }
    else {
        foreach ($p in $doomed) {
            try {
                Remove-Item -LiteralPath $p -Recurse -Force
                Write-Log -Level 'OK' -Message ('  local pruned {0}' -f $p)
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

if ($publishOk) {
    Write-Log -Level 'OK' -Message ('Published  : {0} (sha256 re-verified at the destination)' -f $publishPaths.Archive)
}
elseif ($publishAttempted) {
    Write-Log -Level 'FAIL' -Message 'Published  : FAILED - no durable copy was made in the library.'
}
else {
    Write-Log -Level 'WARN' -Message 'Published  : SKIPPED - no durable copy was made in the library.'
}

if ($uploadOk) {
    Write-Log -Level 'OK' -Message ('Off-site   : s3://{0}/{1} (verified)' -f $AwsBucket, $archiveKey)
}
elseif ($uploadAttempted) {
    Write-Log -Level 'FAIL' -Message 'Off-site   : FAILED - the S3 copy of this set does not exist.'
}
else {
    Write-Log -Level 'INFO' -Message 'Off-site   : skipped (S3 stage is dormant).'
}

if (-not $durableOk) {
    Write-Log -Level 'WARN' -Message 'Durable    : NONE - this set exists on one machine only.'
}

if ($script:Warnings.Count -gt 0) {
    Write-Log -Level 'WARN' -Message ('{0} warning(s):' -f $script:Warnings.Count)
    foreach ($w in $script:Warnings) { Write-Log -Level 'WARN' -Message ('  - {0}' -f $w) }
}

# Exit-code contract (documented in docs/processes/backup-and-restore.md):
#   0 fully backed up  1 warnings, a durable copy exists  2 refused to start  3 dump failed
#   4 backed up LOCALLY ONLY (no durable copy)            5 publish or upload FAILED
# Most specific wins: a failed durable copy outranks a skip, which outranks ordinary warnings.
# 4 is now the AND of both durable hops: a verified publish is a durable copy on its own, so a
# dormant, unconfigured S3 stage no longer implies "locally only".
if ($durableFailed) {
    if ($publishAttempted -and -not $publishOk) {
        Write-Log -Level 'FAIL' -Message 'Result: PUBLISH FAILED (exit 5). Local set retained in full, nothing pruned.'
    }
    else {
        Write-Log -Level 'FAIL' -Message 'Result: OFF-SITE UPLOAD FAILED (exit 5). Local set retained in full, nothing pruned.'
    }
    exit 5
}
if (-not $durableOk) {
    Write-Log -Level 'WARN' -Message 'Result: BACKED UP LOCALLY ONLY (exit 4). No durable copy of this set exists.'
    exit 4
}
if ($script:Warnings.Count -gt 0) {
    Write-Log -Level 'WARN' -Message 'Result: fully backed up, with warnings (exit 1).'
    exit 1
}
if ($publishOk -and $uploadSkipped) {
    Write-Log -Level 'OK' -Message 'Result: fully backed up - local set and verified published copy (exit 0).'
}
elseif ($publishSkipped -and $uploadOk) {
    Write-Log -Level 'OK' -Message 'Result: fully backed up - local set and verified off-site S3 copy (exit 0).'
}
else {
    Write-Log -Level 'OK' -Message 'Result: fully backed up - local set, published copy and off-site S3 copy (exit 0).'
}
exit 0
