#Requires -Version 5.1
<#
.SYNOPSIS
    Restore an NDT Suite logical backup set produced by scripts/db-backup.ps1.

.DESCRIPTION
    Walks the proven restore sequence from
    docs/plans/2026-08-17-supabase-project-migration-runbook.md (Phase 2), which was executed
    end-to-end during the 2026-08-17 dry run and again at cutover:

      Gate 0  artifact integrity   - every artifact re-hashed against manifest.json
      Step 1  roles + schema + data - ONE dockerized postgres:17 psql invocation,
                                      --single-transaction --variable ON_ERROR_STOP=1, with
                                      SET session_replication_role = replica between schema
                                      and data (disables FK triggers; the circular-FK
                                      warnings from pg_dump are expected and harmless)
      Step 2  migration ledger      - history.sql (DDL) then history-data.sql (rows).
                                      Both are required; the DDL alone restores an empty ledger.
      Step 3  storage policies      - storage-policies.sql. Storage policies do NOT survive a
                                      CLI dump (0/33 in the dry run), so db-backup.ps1 captures
                                      them from the catalog and this step replays them.
      Step 4  storage object bytes  - optional rclone push (-RestoreStorage).
      Gate 1  verification          - row counts, pg_policies counts (public + storage),
                                      migration ledger rows, bucket rows; all compared against
                                      the manifest. PASS/FAIL summary, non-zero exit on FAIL.

    TARGETS
      -TargetDbUrl <url>   a scratch / replacement Supabase project (the authoritative path).
      -LocalDocker         a throwaway local postgres:17 container. This is a SMOKE TEST of
                           dump integrity, not a faithful Supabase restore: the stock image
                           has no pg_cron / pg_net and none of the platform-managed auth and
                           storage service roles, so parts of schema.sql will error. Use
                           -ContinueOnError with it and read the result as "the dumps parse
                           and the data loads", not "the platform is reproducible locally".

    Restoring over PRODUCTION requires -IAcceptProductionRestore AND a typed confirmation.

.PARAMETER BackupPath
    A backup set held locally: either the day folder (containing roles.sql ... manifest.json)
    or the encrypted ndt-backup-<date>.7z, which is extracted first using the secrets file
    passphrase. Mutually exclusive with -FromPublish and -FromS3.

.PARAMETER FromPublish
    THE NORMAL ENTRY POINT since 2026-08-31. Restores from the published set in the Company
    OneDrive / SharePoint library, which is the durable copy; local disk is only a cache.

    Takes a partition date (yyyy-MM-dd) or the word "latest" (an empty string means the same),
    resolved against <publish dir>\db\YYYY\. The date is required-or-"latest" rather than
    genuinely optional because Windows PowerShell 5.1 binds the NEXT token as the value of a
    [string] parameter - a bare "-FromPublish -DryRun" would silently set it to "-DryRun".

    The archive and its manifest sidecar are COPIED OUT of the library into the local cache
    (-PublishCacheRoot) before anything else happens, then the archive is re-hashed against
    archive.sha256 in that sidecar, and only then does the ordinary local path continue. The
    copy is not a convenience: extraction writes a plaintext folder beside the archive, and the
    library must never hold plaintext. That is the same ciphertext-only invariant db-backup.ps1
    enforces when publishing, read from the other end.

.PARAMETER PublishDir
    The library folder holding published sets. Default:

        C:\Users\jonas\OneDrive - Matrix\Matrix IMS - Documents\DB Backup

    Overridable with $env:NDT_BACKUP_PUBLISH_DIR or this parameter. Kept identical to
    db-backup.ps1 -PublishDir.

.PARAMETER PublishCacheRoot
    Where a set fetched with -FromPublish is copied to, and extracted. Default
    C:\Users\jonas\ndt-backups\_from-publish\<date>\. Must be off cloud sync and out of git,
    like every other path that ends up holding a dump.

.PARAMETER FromS3
    Partition date (yyyy-MM-dd) of a set to fetch from the off-site S3 bucket before restoring.
    The S3 stage is DORMANT since 2026-08-31 - this path is kept working for sets published to
    the bucket while it was live, and for the day it is re-armed. The archive and its manifest
    sidecar are pulled from

        <bucket>/ndt-backups/db/year=YYYY/month=MM/day=DD/

    the archive's sha256 is checked against the manifest's archive block, and the restore then
    continues down the ordinary local path unchanged.

    READ CREDENTIALS ARE SEPARATE FROM WRITE CREDENTIALS. The backup identity is Put/List only
    and cannot read a single object back. Restoring uses a second IAM user (GetObject +
    ListBucket) whose keys are deliberately NOT configured on this machine day to day - they
    are kept offline and the rclone remote named by -AwsRemote is created during the incident.
    If the remote is absent the script says so and stops rather than silently falling back.

.PARAMETER AwsRemote
    rclone remote holding the RESTORE-READER credentials. Default "ndt-aws-restore".

.PARAMETER AwsBucket
    Source bucket for -FromS3. Defaults to $env:NDT_RESTORE_S3_BUCKET, then
    $env:NDT_BACKUP_S3_BUCKET.

.PARAMETER S3CacheRoot
    Where fetched sets land. Default C:\Users\jonas\ndt-backups\_from-s3\<date>\. Must be off
    cloud sync and out of git, like every other path holding a dump.

.EXAMPLE
    powershell -NoProfile -File scripts\db-restore.ps1 -FromPublish latest -DryRun

.EXAMPLE
    powershell -NoProfile -File scripts\db-restore.ps1 -FromPublish 2026-08-31 -LocalDocker -ContinueOnError

.EXAMPLE
    powershell -NoProfile -File scripts\db-restore.ps1 -BackupPath C:\Users\jonas\ndt-backups\2026-08-26 -DryRun

.EXAMPLE
    powershell -NoProfile -File scripts\db-restore.ps1 -BackupPath C:\Users\jonas\ndt-backups\ndt-backup-2026-08-26.7z -LocalDocker -ContinueOnError

.EXAMPLE
    powershell -NoProfile -File scripts\db-restore.ps1 -FromS3 2026-08-26 -LocalDocker -ContinueOnError

.NOTES
    Windows PowerShell 5.1 compatible: no '&&' / '||' chains, no ternary operator.
    Every file write states its encoding explicitly (UTF-8, no BOM).
    See docs/processes/disaster-recovery.md for the human-facing procedure.
#>

[CmdletBinding()]
param(
    # Exactly one of -BackupPath / -FromPublish / -FromS3. BackupPath is no longer Mandatory
    # because the other two supply the set instead; the trio is validated by hand below so the
    # error message can explain the choice rather than prompting for a path the operator may
    # not have.
    [string] $BackupPath,

    # --- durable source (OneDrive for Business) ---
    [string] $FromPublish,
    [string] $PublishDir,
    [string] $PublishCacheRoot = 'C:\Users\jonas\ndt-backups\_from-publish',

    # --- off-site source (AWS S3, dormant) ---
    [string] $FromS3,
    [string] $AwsRemote = 'ndt-aws-restore',
    [string] $AwsBucket,
    [string] $AwsRegion,
    [string] $KeyPrefix = 'ndt-backups',
    [string] $S3CacheRoot = 'C:\Users\jonas\ndt-backups\_from-s3',

    [string] $TargetDbUrl,
    [switch] $LocalDocker,
    [string] $LocalContainerName = 'ndt-dr-restore',
    [switch] $KeepLocalContainer,

    [string] $SecretsFile = 'C:\Users\jonas\supabase-backup\secrets.ps1',
    [string] $ProductionRef = 'ntrgjqrbewbvwofupphn',
    [switch] $IAcceptProductionRestore,

    [switch] $RestoreStorage,
    [string] $TargetProjectRef,
    [string] $S3AccessKey,
    [string] $S3SecretKey,
    [string] $S3Region = 'eu-west-2',

    [switch] $ContinueOnError,
    [switch] $DryRun
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------

$script:Gates = New-Object System.Collections.ArrayList

function Write-Log {
    param(
        [string] $Message,
        [ValidateSet('INFO', 'STEP', 'OK', 'WARN', 'FAIL', 'PLAN')]
        [string] $Level = 'INFO'
    )
    $stamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    $color = 'Gray'
    if ($Level -eq 'STEP') { $color = 'Cyan' }
    if ($Level -eq 'OK')   { $color = 'Green' }
    if ($Level -eq 'WARN') { $color = 'Yellow' }
    if ($Level -eq 'FAIL') { $color = 'Red' }
    if ($Level -eq 'PLAN') { $color = 'White' }
    Write-Host ('{0} [{1}] {2}' -f $stamp, $Level, $Message) -ForegroundColor $color
}

function Add-Gate {
    param(
        [string] $Name,
        [bool]   $Passed,
        [string] $Detail
    )
    [void]$script:Gates.Add([pscustomobject]@{
        Name   = [string]$Name
        Passed = [bool]$Passed
        Detail = [string]$Detail
    })
    if ($Passed) { Write-Log -Level 'OK'   -Message ('GATE PASS  {0} - {1}' -f $Name, $Detail) }
    else         { Write-Log -Level 'FAIL' -Message ('GATE FAIL  {0} - {1}' -f $Name, $Detail) }
}

function Write-Utf8File {
    # Explicit UTF-8 without BOM. Set-Content -Encoding UTF8 emits a BOM on PS 5.1 and a BOM
    # has already broken a CLI in this repo once (.env scar).
    param(
        [Parameter(Mandatory = $true)][string] $Path,
        [Parameter(Mandatory = $true)][AllowEmptyString()][string] $Content
    )
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

function Format-MaskedUrl {
    param([string] $Url)
    if ([string]::IsNullOrWhiteSpace($Url)) { return '<not set>' }
    return [regex]::Replace($Url, '(?<=://[^:/@]+:)[^@]*(?=@)', '***')
}

function Test-CommandAvailable {
    param([string] $Name)
    $cmd = Get-Command $Name -ErrorAction SilentlyContinue
    if ($null -eq $cmd) { return $null }
    return $cmd.Source
}

function Invoke-Native {
    # Every native call goes through here. With $ErrorActionPreference = 'Stop', redirecting a
    # native command's stderr (2>&1) turns ordinary chatter into a TERMINATING error: docker's
    # "No such container", psql NOTICEs, rclone progress. Exit codes are the truth for native
    # tools, so stderr is demoted to plain output and the caller decides on ExitCode.
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
    $candidates = @('C:\Program Files\7-Zip\7z.exe', 'C:\Program Files (x86)\7-Zip\7z.exe')
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) { return $candidate }
    }
    return (Test-CommandAvailable -Name '7z')
}

# ---------------------------------------------------------------------------
# Publish helpers - kept identical in scripts/db-backup.ps1. The two scripts address the same
# <publish dir>\db\YYYY\ layout from opposite directions, so it must be computed the same way in
# both; if one changes, change the other in the same commit.
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

function Get-PublishedDateKeys {
    # Date keys that actually have an ARCHIVE published, newest first. A lone sidecar is not a
    # set: resolving "latest" onto a date whose .7z is missing would report the wrong failure.
    param([Parameter(Mandatory = $true)][string] $Root)
    $keys = New-Object System.Collections.ArrayList
    $dbRoot = Join-Path $Root 'db'
    if (-not (Test-Path -LiteralPath $dbRoot)) { return @() }

    $files = Get-ChildItem -LiteralPath $dbRoot -File -Recurse -Filter 'ndt-backup-*.7z' -ErrorAction SilentlyContinue
    foreach ($file in $files) {
        if ($file.Name -match '^ndt-backup-(\d{4}-\d{2}-\d{2})\.7z$') {
            if (-not $keys.Contains($Matches[1])) { [void]$keys.Add($Matches[1]) }
        }
    }
    return @($keys | Sort-Object -Descending)
}

# ---------------------------------------------------------------------------
# rclone helpers - kept byte-identical in scripts/db-backup.ps1. The two scripts address the
# same key layout from opposite directions, so the layout must be computed the same way in
# both; if one changes, change the other in the same commit.
# ---------------------------------------------------------------------------

function Get-PartitionPrefix {
    param(
        [Parameter(Mandatory = $true)][string] $Prefix,
        [Parameter(Mandatory = $true)][string] $DateKey
    )
    $parts = $DateKey -split '-'
    return ('{0}/db/year={1}/month={2}/day={3}' -f $Prefix, $parts[0], $parts[1], $parts[2])
}

function Get-AwsRemoteSpec {
    # An rclone connection string, not a flag: options bind to this remote only. A bare
    # --s3-* flag would also reconfigure any other s3 remote in the same command, and
    # RCLONE_S3_* backend env vars outrank rclone.conf, which is why the Supabase source in
    # Step 4 is expressed as a remote-specific RCLONE_CONFIG_NDTSUPA_* remote. Requires
    # rclone 1.56 or newer. Kept identical to db-backup.ps1: the options are inert when the
    # remote is only read from, and keeping one spelling keeps the two scripts comparable.
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

# ---------------------------------------------------------------------------
# Credentials
# ---------------------------------------------------------------------------

$secretsLoaded = $false
if (-not [string]::IsNullOrWhiteSpace($SecretsFile)) {
    if (Test-Path -LiteralPath $SecretsFile) {
        Write-Log -Level 'INFO' -Message ('Dot-sourcing secrets file: {0}' -f $SecretsFile)
        . $SecretsFile
        $secretsLoaded = $true
    }
}

if ([string]::IsNullOrWhiteSpace($TargetDbUrl)) { $TargetDbUrl = $env:NDT_RESTORE_TARGET_DB_URL }
if ([string]::IsNullOrWhiteSpace($S3AccessKey)) { $S3AccessKey = $env:NDT_RESTORE_S3_KEY }
if ([string]::IsNullOrWhiteSpace($S3SecretKey)) { $S3SecretKey = $env:NDT_RESTORE_S3_SECRET }
if ([string]::IsNullOrWhiteSpace($AwsBucket))   { $AwsBucket = $env:NDT_RESTORE_S3_BUCKET }
if ([string]::IsNullOrWhiteSpace($AwsBucket))   { $AwsBucket = $env:NDT_BACKUP_S3_BUCKET }
if ([string]::IsNullOrWhiteSpace($AwsRegion))   { $AwsRegion = $env:NDT_RESTORE_S3_REGION }
if ([string]::IsNullOrWhiteSpace($AwsRegion))   { $AwsRegion = $env:NDT_BACKUP_S3_REGION }
$passphrase = $env:NDT_BACKUP_PASSPHRASE

# Publish source: -PublishDir, then the environment, then the owner's library. Same resolution
# order and same default as db-backup.ps1 - a path, not a credential.
$DefaultPublishDir = 'C:\Users\jonas\OneDrive - Matrix\Matrix IMS - Documents\DB Backup'
if ([string]::IsNullOrWhiteSpace($PublishDir)) { $PublishDir = $env:NDT_BACKUP_PUBLISH_DIR }
if ([string]::IsNullOrWhiteSpace($PublishDir)) { $PublishDir = $DefaultPublishDir }

$dockerCmd = Test-CommandAvailable -Name 'docker'
$rcloneCmd = Test-CommandAvailable -Name 'rclone'
$sevenZip  = Resolve-SevenZip

# ---------------------------------------------------------------------------
# Source selection: a local set, the published set in the OneDrive library, or a dated partition
# fetched from the dormant S3 bucket. Exactly one.
# ---------------------------------------------------------------------------

# ContainsKey, not a value test: "" and "latest" both mean "the newest published set", so the
# presence of the switch is what selects this source.
$usePublish = $PSBoundParameters.ContainsKey('FromPublish')
$useS3      = -not [string]::IsNullOrWhiteSpace($FromS3)

$sourceCount = 0
if ($usePublish)                                    { $sourceCount = $sourceCount + 1 }
if ($useS3)                                         { $sourceCount = $sourceCount + 1 }
if (-not [string]::IsNullOrWhiteSpace($BackupPath)) { $sourceCount = $sourceCount + 1 }

if ($sourceCount -gt 1) {
    Write-Log -Level 'FAIL' -Message '-BackupPath, -FromPublish and -FromS3 are mutually exclusive. Pick one source.'
    exit 2
}
if ($sourceCount -eq 0) {
    Write-Log -Level 'FAIL' -Message 'Nothing to restore from.'
    Write-Log -Level 'FAIL' -Message '  -FromPublish <yyyy-MM-dd | latest>                the durable copy in the OneDrive library (normal path)'
    Write-Log -Level 'FAIL' -Message '  -BackupPath <day folder | ndt-backup-<date>.7z>   restore a set held locally'
    Write-Log -Level 'FAIL' -Message '  -FromS3 <yyyy-MM-dd>                              fetch the set from the dormant off-site bucket'
    exit 2
}

$s3PlanOnly      = $false
$publishPlanOnly = $false

# ---------------------------------------------------------------------------
# -FromPublish: resolve the set in the library, copy it OUT into the local cache, then prove it
#
# The copy is the ciphertext-only invariant read from the restore end. Extraction writes a
# plaintext folder beside the archive it extracts, so the archive must be moved out of the
# synced library BEFORE anything is decrypted. Nothing is ever written into the library here.
# ---------------------------------------------------------------------------

if ($usePublish) {
    $publishFull = [System.IO.Path]::GetFullPath($PublishDir)
    $wantLatest = ([string]::IsNullOrWhiteSpace($FromPublish) -or $FromPublish -eq 'latest' -or $FromPublish -eq 'newest')

    if (-not $wantLatest -and $FromPublish -notmatch '^\d{4}-\d{2}-\d{2}$') {
        Write-Log -Level 'FAIL' -Message ('-FromPublish takes a date in yyyy-MM-dd form, or "latest"; got "{0}".' -f $FromPublish)
        exit 2
    }

    $publishMissing = New-Object System.Collections.ArrayList
    $publishDateKey = $null
    $publishSet     = $null

    if (-not (Test-Path -LiteralPath $publishFull)) {
        [void]$publishMissing.Add(('publish directory "{0}" does not exist - OneDrive is not set up on this machine, or that library is not synced yet' -f $publishFull))
    }
    else {
        if ($wantLatest) {
            $availableKeys = Get-PublishedDateKeys -Root $publishFull
            if ($availableKeys.Count -eq 0) {
                [void]$publishMissing.Add(('no published sets under "{0}\db\" - nothing has been published there yet' -f $publishFull))
            }
            else {
                $publishDateKey = [string]$availableKeys[0]
                Write-Log -Level 'INFO' -Message ('Latest published set: {0} (of {1} available)' -f $publishDateKey, $availableKeys.Count)
            }
        }
        else {
            $publishDateKey = [string]$FromPublish
        }
    }

    if ($null -ne $publishDateKey) {
        $publishSet = Get-PublishSetPaths -Root $publishFull -DateKey $publishDateKey
        if (-not (Test-Path -LiteralPath $publishSet.Archive)) {
            [void]$publishMissing.Add(('archive not found: {0}' -f $publishSet.Archive))
        }
        if (-not (Test-Path -LiteralPath $publishSet.Manifest)) {
            [void]$publishMissing.Add(('manifest sidecar not found: {0}' -f $publishSet.Manifest))
        }
    }

    $publishCacheDir     = $null
    $publishCacheArchive = $null
    $publishCacheSidecar = $null
    if ($null -ne $publishDateKey) {
        $publishCacheDir     = Join-Path $PublishCacheRoot $publishDateKey
        $publishCacheArchive = Join-Path $publishCacheDir ('ndt-backup-{0}.7z' -f $publishDateKey)
        $publishCacheSidecar = Join-Path $publishCacheDir ('ndt-backup-{0}.manifest.json' -f $publishDateKey)
    }

    $publishLabel = $publishDateKey
    if ([string]::IsNullOrWhiteSpace($publishLabel)) { $publishLabel = '<unresolved>' }
    Write-Log -Level 'STEP' -Message ('Published set   {0}' -f $publishLabel)

    if ($DryRun) {
        $publishPlanOnly = $true
        Write-Log -Level 'PLAN' -Message ('  library      : {0}' -f $publishFull)
        if ($null -ne $publishSet) {
            Write-Log -Level 'PLAN' -Message ('  copy "{0}"' -f $publishSet.Archive)
            Write-Log -Level 'PLAN' -Message ('    -> "{0}"' -f $publishCacheArchive)
            Write-Log -Level 'PLAN' -Message ('  copy "{0}"' -f $publishSet.Manifest)
            Write-Log -Level 'PLAN' -Message ('    -> "{0}"' -f $publishCacheSidecar)
        }
        Write-Log -Level 'PLAN' -Message '  then sha256(archive) is compared against archive.sha256 in the copied manifest'
        Write-Log -Level 'PLAN' -Message '  and the ordinary local restore path continues unchanged (extraction happens in the cache,'
        Write-Log -Level 'PLAN' -Message '  never in the library - the library holds ciphertext only)'
        if ($publishMissing.Count -gt 0) {
            foreach ($m in $publishMissing) { Write-Log -Level 'WARN' -Message ('  BLOCKER: {0}' -f $m) }
        }
        else {
            Write-Log -Level 'OK' -Message '  the published set is present and readable'
        }
    }
    else {
        if ($publishMissing.Count -gt 0) {
            foreach ($m in $publishMissing) { Write-Log -Level 'FAIL' -Message ('  {0}' -f $m) }
            exit 2
        }

        [void](New-Item -ItemType Directory -Path $publishCacheDir -Force)

        Write-Log -Level 'INFO' -Message ('  copying {0}' -f (Split-Path -Leaf $publishSet.Archive))
        try { Copy-Item -LiteralPath $publishSet.Archive -Destination $publishCacheArchive -Force }
        catch {
            Write-Log -Level 'FAIL' -Message ('  could not copy the archive out of the library: {0}' -f $_.Exception.Message)
            exit 3
        }

        Write-Log -Level 'INFO' -Message ('  copying {0}' -f (Split-Path -Leaf $publishSet.Manifest))
        try { Copy-Item -LiteralPath $publishSet.Manifest -Destination $publishCacheSidecar -Force }
        catch {
            Write-Log -Level 'FAIL' -Message ('  could not copy the manifest sidecar out of the library: {0}' -f $_.Exception.Message)
            Write-Log -Level 'FAIL' -Message '  Without it the archive cannot be proven intact before the passphrase is used.'
            exit 3
        }

        # Gate publish: prove the bytes before spending the passphrase on them. Same gate as
        # Gate S3, for the same reason - the sidecar carries the archive's own sha256, which the
        # manifest sealed inside the archive cannot. Gate 0 then proves the dumps against the
        # inner manifest, so the set is checked at both levels.
        $pubRaw = [string](Get-Content -LiteralPath $publishCacheSidecar -Raw)
        $pubSide = $null
        try { $pubSide = ConvertFrom-Json -InputObject $pubRaw } catch { $pubSide = $null }

        if ($null -eq $pubSide -or $null -eq $pubSide.archive -or [string]::IsNullOrWhiteSpace([string]$pubSide.archive.sha256)) {
            Write-Log -Level 'WARN' -Message '  the manifest sidecar carries no archive block - archive-level integrity NOT verified.'
            Write-Log -Level 'WARN' -Message '  (Gate 0 still checks every dump inside it.)'
            Add-Gate -Name 'publish-archive-integrity' -Passed $true -Detail 'skipped - manifest has no archive block'
        }
        else {
            $pubActual = [string](Get-FileHash -LiteralPath $publishCacheArchive -Algorithm SHA256).Hash
            $pubExpected = [string]$pubSide.archive.sha256
            if ($pubActual -ne $pubExpected) {
                Add-Gate -Name 'publish-archive-integrity' -Passed $false -Detail ('sha256 mismatch: expected {0}, got {1}' -f $pubExpected, $pubActual)
                Write-Log -Level 'FAIL' -Message '  The published archive does not match its manifest. Do NOT restore from it.'
                Write-Log -Level 'FAIL' -Message '  Treat as an incident: sync corruption, an interrupted publish, or the file was modified'
                Write-Log -Level 'FAIL' -Message '  in the library. OneDrive version history holds earlier versions of this same file.'
                exit 3
            }
            Add-Gate -Name 'publish-archive-integrity' -Passed $true -Detail ('sha256 matches the manifest ({0:N0} bytes)' -f (Get-Item -LiteralPath $publishCacheArchive).Length)
        }

        $BackupPath = $publishCacheArchive
        Write-Log -Level 'OK' -Message ('  copied to {0}' -f $publishCacheArchive)
        Write-Log -Level 'WARN' -Message ('  this copied set is PII on local disk - delete {0} once the restore is signed off.' -f $publishCacheDir)
    }
}

if ($useS3) {
    if ($FromS3 -notmatch '^\d{4}-\d{2}-\d{2}$') {
        Write-Log -Level 'FAIL' -Message ('-FromS3 must be a partition date in yyyy-MM-dd form; got "{0}".' -f $FromS3)
        exit 2
    }

    $s3ArchiveName  = 'ndt-backup-{0}.7z' -f $FromS3
    $s3ManifestName = 'ndt-backup-{0}.manifest.json' -f $FromS3
    $s3Partition    = Get-PartitionPrefix -Prefix $KeyPrefix -DateKey $FromS3

    $bucketForSpec = $AwsBucket
    if ([string]::IsNullOrWhiteSpace($bucketForSpec)) { $bucketForSpec = '<bucket>' }
    $srcArchive  = Get-AwsRemoteSpec -Remote $AwsRemote -Region $AwsRegion -Path ('{0}/{1}/{2}' -f $bucketForSpec, $s3Partition, $s3ArchiveName)
    $srcManifest = Get-AwsRemoteSpec -Remote $AwsRemote -Region $AwsRegion -Path ('{0}/{1}/{2}' -f $bucketForSpec, $s3Partition, $s3ManifestName)

    $localSetDir       = Join-Path $S3CacheRoot $FromS3
    $localArchivePath  = Join-Path $localSetDir $s3ArchiveName
    $localManifestPath = Join-Path $localSetDir $s3ManifestName

    $s3Missing = New-Object System.Collections.ArrayList
    if ($null -eq $rcloneCmd) {
        [void]$s3Missing.Add('rclone is not installed or not on PATH')
    }
    elseif (-not (Test-RcloneRemote -Name $AwsRemote)) {
        [void]$s3Missing.Add(('rclone remote "{0}:" is not configured. The restore-reader keys are kept OFFLINE by design - create the remote now from the offline record (docs/processes/aws-backup-setup.md)' -f $AwsRemote))
    }
    if ([string]::IsNullOrWhiteSpace($AwsBucket)) {
        [void]$s3Missing.Add('source bucket unknown - pass -AwsBucket or set $env:NDT_RESTORE_S3_BUCKET')
    }

    Write-Log -Level 'STEP' -Message ('Off-site fetch  partition {0}' -f $s3Partition)

    if ($DryRun) {
        $s3PlanOnly = $true
        Write-Log -Level 'PLAN' -Message ('  rclone copyto "{0}" "{1}"' -f $srcArchive, $localArchivePath)
        Write-Log -Level 'PLAN' -Message ('  rclone copyto "{0}" "{1}"' -f $srcManifest, $localManifestPath)
        Write-Log -Level 'PLAN' -Message '  then sha256(archive) is compared against archive.sha256 in the fetched manifest'
        Write-Log -Level 'PLAN' -Message '  and the ordinary local restore path continues unchanged'
        if ($s3Missing.Count -gt 0) {
            foreach ($m in $s3Missing) { Write-Log -Level 'WARN' -Message ('  BLOCKER: {0}' -f $m) }
        }
        else {
            Write-Log -Level 'OK' -Message ('  reader remote "{0}:" is configured' -f $AwsRemote)
        }
    }
    else {
        if ($s3Missing.Count -gt 0) {
            foreach ($m in $s3Missing) { Write-Log -Level 'FAIL' -Message ('  {0}' -f $m) }
            exit 2
        }

        [void](New-Item -ItemType Directory -Path $localSetDir -Force)

        Write-Log -Level 'INFO' -Message ('  fetching {0}' -f $s3ArchiveName)
        $getArchive = Invoke-Native -Exe 'rclone' -Arguments @('copyto', $srcArchive, $localArchivePath, '--stats-one-line', '--stats', '30s')
        Write-NativeOutput -Lines $getArchive.Output
        if ($getArchive.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $localArchivePath)) {
            Write-Log -Level 'FAIL' -Message ('  rclone copyto exited {0} - the archive was not fetched.' -f $getArchive.ExitCode)
            Write-Log -Level 'FAIL' -Message ('  Check the partition exists: rclone lsjson "{0}"' -f (Get-AwsRemoteSpec -Remote $AwsRemote -Region $AwsRegion -Path ('{0}/{1}' -f $AwsBucket, $s3Partition)))
            exit 3
        }

        Write-Log -Level 'INFO' -Message ('  fetching {0}' -f $s3ManifestName)
        $getManifest = Invoke-Native -Exe 'rclone' -Arguments @('copyto', $srcManifest, $localManifestPath, '--stats-one-line', '--stats', '30s')
        Write-NativeOutput -Lines $getManifest.Output
        if ($getManifest.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $localManifestPath)) {
            Write-Log -Level 'FAIL' -Message ('  rclone copyto exited {0} - the manifest sidecar was not fetched.' -f $getManifest.ExitCode)
            Write-Log -Level 'FAIL' -Message '  Without it the archive cannot be proven intact before the passphrase is used.'
            exit 3
        }

        # Gate S3: prove the transferred bytes before spending the passphrase on them. The
        # sidecar carries the archive's own sha256, which the manifest sealed inside the
        # archive cannot. Gate 0 below then proves the individual dumps against the inner
        # manifest, so the set is checked at both levels.
        $sideRaw = [string](Get-Content -LiteralPath $localManifestPath -Raw)
        $side = $null
        try { $side = ConvertFrom-Json -InputObject $sideRaw } catch { $side = $null }

        if ($null -eq $side -or $null -eq $side.archive -or [string]::IsNullOrWhiteSpace([string]$side.archive.sha256)) {
            Write-Log -Level 'WARN' -Message '  the fetched manifest carries no archive block - archive-level integrity NOT verified.'
            Write-Log -Level 'WARN' -Message '  (sets written before the off-site stage landed do not have one; Gate 0 still checks every dump.)'
            Add-Gate -Name 's3-archive-integrity' -Passed $true -Detail 'skipped - manifest has no archive block'
        }
        else {
            $actualHash = (Get-FileHash -LiteralPath $localArchivePath -Algorithm SHA256).Hash
            $expectedHash = [string]$side.archive.sha256
            if ($actualHash -ne $expectedHash) {
                Add-Gate -Name 's3-archive-integrity' -Passed $false -Detail ('sha256 mismatch: expected {0}, got {1}' -f $expectedHash, $actualHash)
                Write-Log -Level 'FAIL' -Message '  The fetched archive does not match its manifest. Do NOT restore from it.'
                Write-Log -Level 'FAIL' -Message '  Treat as an incident: transfer corruption, or the object was modified in the bucket.'
                exit 3
            }
            Add-Gate -Name 's3-archive-integrity' -Passed $true -Detail ('sha256 matches the manifest ({0:N0} bytes)' -f (Get-Item -LiteralPath $localArchivePath).Length)
        }

        $BackupPath = $localArchivePath
        Write-Log -Level 'OK' -Message ('  fetched to {0}' -f $localArchivePath)
        Write-Log -Level 'WARN' -Message ('  this fetched set is PII on local disk - delete {0} once the restore is signed off.' -f $localSetDir)
    }
}

# ---------------------------------------------------------------------------
# Resolve the backup set (extract if encrypted)
# ---------------------------------------------------------------------------

$restoreDir = $null
$extractedTemp = $null
# True when $restoreDir names a set that does not exist on disk yet (dry run). Guards every
# later filesystem probe - see the note above $storagePolicyFile.
$restoreDirIsPlaceholder = $false

if ($s3PlanOnly -or $publishPlanOnly) {
    # -FromS3 / -FromPublish with -DryRun: nothing has been fetched or copied, so there is no
    # set on disk to inspect. The rest of the plan still prints, against a placeholder. It must
    # contain NO colon and no slash: downstream Join-Path calls read a colon as a drive
    # qualifier and throw DriveNotFound. The source is already printed in the plan above.
    if ($publishPlanOnly) { $restoreDir = '<archive-copied-from-the-library-then-extracted>' }
    else                  { $restoreDir = '<archive-fetched-from-s3-then-extracted>' }
    $restoreDirIsPlaceholder = $true
}
else {

if (-not (Test-Path -LiteralPath $BackupPath)) {
    Write-Log -Level 'FAIL' -Message ('Backup path not found: {0}' -f $BackupPath)
    exit 2
}

$backupItem = Get-Item -LiteralPath $BackupPath

if ($backupItem.PSIsContainer) {
    $restoreDir = $backupItem.FullName
}
elseif ($backupItem.Extension -eq '.7z') {
    if ($DryRun) {
        Write-Log -Level 'PLAN' -Message ('Would extract {0} with 7-Zip before restoring.' -f $backupItem.FullName)
        $restoreDir = '<extracted-temp-dir>'
        $restoreDirIsPlaceholder = $true
    }
    else {
        if ($null -eq $sevenZip) {
            Write-Log -Level 'FAIL' -Message '7-Zip not found - cannot extract the encrypted backup set.'
            exit 2
        }
        if ([string]::IsNullOrWhiteSpace($passphrase)) {
            Write-Log -Level 'FAIL' -Message 'NDT_BACKUP_PASSPHRASE not set - cannot decrypt the backup set.'
            Write-Log -Level 'FAIL' -Message ('Expected it from {0}. Credentials are never read from the repository.' -f $SecretsFile)
            exit 2
        }
        $extractedTemp = Join-Path $backupItem.DirectoryName ($backupItem.BaseName + '-restore-tmp')
        if (Test-Path -LiteralPath $extractedTemp) { Remove-Item -LiteralPath $extractedTemp -Recurse -Force }
        [void](New-Item -ItemType Directory -Path $extractedTemp -Force)
        Write-Log -Level 'STEP' -Message ('Extracting {0}' -f $backupItem.Name)
        $extract = Invoke-Native -Exe $sevenZip -Arguments @('x', ('-p{0}' -f $passphrase), ('-o{0}' -f $extractedTemp), '-y', $backupItem.FullName)
        if ($extract.ExitCode -ne 0) {
            Write-Log -Level 'FAIL' -Message ('7-Zip extraction failed (exit {0}) - wrong passphrase or corrupt archive.' -f $extract.ExitCode)
            exit 3
        }
        $restoreDir = $extractedTemp
        Write-Log -Level 'OK' -Message ('  extracted to {0}' -f $restoreDir)
    }
}
else {
    Write-Log -Level 'FAIL' -Message 'BackupPath must be a backup day folder or an ndt-backup-<date>.7z archive.'
    exit 2
}

}   # end of the non-plan branch opened at "if ($s3PlanOnly)"

# ---------------------------------------------------------------------------
# Manifest + artifact integrity (Gate 0)
# ---------------------------------------------------------------------------

$requiredArtifacts = @('roles.sql', 'schema.sql', 'data.sql', 'history.sql', 'history-data.sql')
$manifest = $null

if (-not $DryRun) {
    $manifestPath = Join-Path $restoreDir 'manifest.json'
    if (Test-Path -LiteralPath $manifestPath) {
        # [string] cast first: Get-Content -Raw returns an ETS-decorated string on PS 5.1 and
        # feeding that straight into ConvertFrom/ConvertTo-Json misrepresents it as an object.
        $manifestRaw = [string](Get-Content -LiteralPath $manifestPath -Raw)
        try { $manifest = ConvertFrom-Json -InputObject $manifestRaw }
        catch { Write-Log -Level 'WARN' -Message 'manifest.json is unreadable - integrity gate degraded to presence checks.' }
    }
    else {
        Write-Log -Level 'WARN' -Message 'No manifest.json in this backup set - integrity gate degraded to presence checks.'
    }

    Write-Log -Level 'STEP' -Message 'Gate 0  Artifact integrity'
    $integrityOk = $true
    $integrityDetail = 'presence only (no manifest)'

    foreach ($name in $requiredArtifacts) {
        $p = Join-Path $restoreDir $name
        if (-not (Test-Path -LiteralPath $p)) {
            Write-Log -Level 'FAIL' -Message ('  MISSING {0}' -f $name)
            $integrityOk = $false
        }
    }

    if ($null -ne $manifest -and $null -ne $manifest.artifacts) {
        $checked = 0
        foreach ($entry in $manifest.artifacts) {
            $p = Join-Path $restoreDir $entry.name
            if (-not (Test-Path -LiteralPath $p)) {
                Write-Log -Level 'FAIL' -Message ('  MISSING {0} (listed in manifest)' -f $entry.name)
                $integrityOk = $false
                continue
            }
            $actual = (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash
            if ($actual -ne $entry.sha256) {
                Write-Log -Level 'FAIL' -Message ('  SHA256 MISMATCH {0}' -f $entry.name)
                $integrityOk = $false
            }
            else {
                Write-Log -Level 'INFO' -Message ('  ok {0} ({1:N0} bytes)' -f $entry.name, $entry.bytes)
                $checked = $checked + 1
            }
        }
        $integrityDetail = ('{0} artifact(s) matched manifest sha256' -f $checked)
    }

    Add-Gate -Name 'artifact-integrity' -Passed $integrityOk -Detail $integrityDetail
    if (-not $integrityOk) {
        Write-Log -Level 'FAIL' -Message 'Refusing to restore from a backup set that failed its integrity gate.'
        exit 3
    }
}

# On a dry run $restoreDir is a PLACEHOLDER, not a path: the archive has not been extracted
# (and with -FromS3 not even fetched). Probing it is not just pointless, it is fatal -
# Test-Path throws "Illegal characters in path" on the angle brackets and the whole plan dies
# before it prints. Skip the probes and let the plan describe the set instead.
$storagePolicyFile = $null
$hasStoragePolicies = $false
$hasHistoryData = $false

if (-not $restoreDirIsPlaceholder) {
    $storagePolicyFile = Join-Path $restoreDir 'storage-policies.sql'
    $hasStoragePolicies = Test-Path -LiteralPath $storagePolicyFile
    $hasHistoryData = Test-Path -LiteralPath (Join-Path $restoreDir 'history-data.sql')
}

# ---------------------------------------------------------------------------
# Target resolution + production guard
# ---------------------------------------------------------------------------

$mode = 'remote'
if ($LocalDocker) { $mode = 'local' }

if ($mode -eq 'remote') {
    if ([string]::IsNullOrWhiteSpace($TargetDbUrl)) {
        Write-Log -Level 'FAIL' -Message 'No target connection string.'
        Write-Log -Level 'FAIL' -Message ('Pass -TargetDbUrl, set $env:NDT_RESTORE_TARGET_DB_URL in {0}, or use -LocalDocker.' -f $SecretsFile)
        Write-Log -Level 'FAIL' -Message 'Credentials are never read from the repository. Aborting.'
        if (-not $DryRun) { exit 2 }
    }

    $looksProduction = $false
    if (-not [string]::IsNullOrWhiteSpace($TargetDbUrl)) {
        if ($TargetDbUrl -like ('*' + $ProductionRef + '*')) { $looksProduction = $true }
    }

    if ($looksProduction) {
        Write-Log -Level 'WARN' -Message '################################################################'
        Write-Log -Level 'WARN' -Message ('# The target connection string points at PRODUCTION ({0}).' -f $ProductionRef)
        Write-Log -Level 'WARN' -Message '# This restore OVERWRITES live customer data, inspection records'
        Write-Log -Level 'WARN' -Message '# and user credentials with the contents of a dump file.'
        Write-Log -Level 'WARN' -Message '# Everything written since that dump will be lost.'
        Write-Log -Level 'WARN' -Message '################################################################'

        if (-not $IAcceptProductionRestore) {
            Write-Log -Level 'FAIL' -Message 'Refusing: -IAcceptProductionRestore was not supplied.'
            if (-not $DryRun) { exit 2 }
        }
        elseif (-not $DryRun) {
            Write-Host ''
            Write-Host 'Type exactly:  RESTORE PRODUCTION' -ForegroundColor Red
            $typed = Read-Host -Prompt 'Confirmation'
            if ($typed -cne 'RESTORE PRODUCTION') {
                Write-Log -Level 'FAIL' -Message 'Confirmation did not match. Aborting - nothing was changed.'
                exit 2
            }
            Write-Log -Level 'WARN' -Message 'Production restore confirmed by operator.'
        }
    }
}

# ---------------------------------------------------------------------------
# Dry run
# ---------------------------------------------------------------------------

if ($DryRun) {
    Write-Host ''
    Write-Log -Level 'PLAN' -Message '=== NDT Suite restore - DRY RUN (nothing will be changed) ==='
    if ($usePublish)  { Write-Log -Level 'PLAN' -Message ('Source       : published set {0} in {1}' -f $publishLabel, $publishFull) }
    elseif ($useS3)   { Write-Log -Level 'PLAN' -Message ('Source       : off-site S3 partition {0} via remote "{1}:"' -f $FromS3, $AwsRemote) }
    else              { Write-Log -Level 'PLAN' -Message ('Source       : local set {0}' -f $BackupPath) }
    Write-Log -Level 'PLAN' -Message ('Backup set   : {0}' -f $restoreDir)
    Write-Log -Level 'PLAN' -Message ('Mode         : {0}' -f $mode)
    if ($mode -eq 'remote') { Write-Log -Level 'PLAN' -Message ('Target       : {0}' -f (Format-MaskedUrl -Url $TargetDbUrl)) }
    else                    { Write-Log -Level 'PLAN' -Message ('Target       : throwaway container "{0}" from postgres:17' -f $LocalContainerName) }
    Write-Log -Level 'PLAN' -Message ('Secrets file : {0} (present: {1})' -f $SecretsFile, $secretsLoaded)
    Write-Host ''
    if ($usePublish) { Write-Log -Level 'PLAN' -Message 'Gate P  re-hash the copied .7z against archive.sha256 in the manifest sidecar' }
    if ($useS3)      { Write-Log -Level 'PLAN' -Message 'Gate S3 re-hash the fetched .7z against archive.sha256 in the manifest sidecar' }
    Write-Log -Level 'PLAN' -Message 'Gate 0  re-hash every artifact against manifest.json (refuse on mismatch)'
    Write-Log -Level 'PLAN' -Message 'Step 1  psql --single-transaction --variable ON_ERROR_STOP=1 \'
    Write-Log -Level 'PLAN' -Message '          --file roles.sql --file schema.sql \'
    Write-Log -Level 'PLAN' -Message '          --command "SET session_replication_role = replica" --file data.sql'
    Write-Log -Level 'PLAN' -Message 'Step 2  psql --file history.sql --file history-data.sql   (ledger DDL then rows)'
    Write-Log -Level 'PLAN' -Message 'Step 3  psql --file storage-policies.sql                   (catalog-regenerated)'
    if ($RestoreStorage) { Write-Log -Level 'PLAN' -Message 'Step 4  rclone copy <set>\storage\<bucket> ndtsupa:<bucket> --checksum   (target project, keys via RCLONE_CONFIG_NDTSUPA_*)' }
    else                 { Write-Log -Level 'PLAN' -Message 'Step 4  storage object bytes SKIPPED (-RestoreStorage not set)' }
    Write-Log -Level 'PLAN' -Message 'Gate 1  row counts / policy counts / ledger rows vs manifest -> PASS/FAIL summary'
    Write-Host ''
    exit 0
}

# ---------------------------------------------------------------------------
# Docker preflight
# ---------------------------------------------------------------------------

if ($null -eq $dockerCmd) {
    Write-Log -Level 'FAIL' -Message 'docker not found. The restore runs psql from the postgres:17 image. Aborting.'
    exit 2
}

$localPassword = $null

function Start-LocalTarget {
    Write-Log -Level 'STEP' -Message ('Starting throwaway postgres:17 container "{0}"' -f $LocalContainerName)

    # Pre-clean. "No such container" is the normal case, not an error.
    [void](Invoke-Native -Exe 'docker' -Arguments @('rm', '-f', $LocalContainerName))

    $script:localPassword = [guid]::NewGuid().ToString('N')
    $runArgs = @(
        'run', '-d',
        '--name', $LocalContainerName,
        '-e', ('POSTGRES_PASSWORD={0}' -f $script:localPassword),
        '-v', ('{0}:/dump' -f $restoreDir),
        'postgres:17'
    )
    $run = Invoke-Native -Exe 'docker' -Arguments $runArgs
    if ($run.ExitCode -ne 0) {
        Write-NativeOutput -Lines $run.Output
        Write-Log -Level 'FAIL' -Message 'Failed to start the local postgres container.'
        exit 3
    }

    $ready = $false
    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Seconds 1
        $probe = Invoke-Native -Exe 'docker' -Arguments @('exec', $LocalContainerName, 'pg_isready', '-U', 'postgres', '-q')
        if ($probe.ExitCode -eq 0) { $ready = $true; break }
    }
    if (-not $ready) {
        Write-Log -Level 'FAIL' -Message 'Local postgres never became ready.'
        exit 3
    }
    Write-Log -Level 'OK' -Message '  container ready'

    # A stock postgres image is not a Supabase project. Create the roles the dumps reference
    # so the bulk of schema.sql applies; pg_cron / pg_net do not exist in this image at all,
    # which is exactly why the local path is a smoke test and needs -ContinueOnError.
    $bootstrap = @'
do $$
declare r text;
begin
  foreach r in array array['anon','authenticated','service_role','authenticator',
                           'supabase_admin','supabase_auth_admin','supabase_storage_admin',
                           'supabase_functions_admin','supabase_read_only_user',
                           'supabase_realtime_admin','dashboard_user','pgbouncer']
  loop
    if not exists (select 1 from pg_roles where rolname = r) then
      execute format('create role %I nologin noinherit', r);
    end if;
  end loop;
end $$;
create schema if not exists extensions;
create extension if not exists "uuid-ossp" schema extensions;
create extension if not exists pgcrypto schema extensions;
'@
    $bootstrapPath = Join-Path $restoreDir '_local-bootstrap.sql'
    Write-Utf8File -Path $bootstrapPath -Content $bootstrap
    $boot = Invoke-Native -Exe 'docker' -Arguments @(
        'exec', '-w', '/dump', $LocalContainerName,
        'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=0', '-f', '/dump/_local-bootstrap.sql'
    )
    Write-NativeOutput -Lines $boot.Output
    Remove-Item -LiteralPath $bootstrapPath -Force -ErrorAction SilentlyContinue
    Write-Log -Level 'OK' -Message '  supabase-shaped roles bootstrapped (approximation - see -LocalDocker notes)'
}

if ($mode -eq 'local') { Start-LocalTarget }

# ---------------------------------------------------------------------------
# psql dispatch
# ---------------------------------------------------------------------------

function Invoke-RestorePsql {
    param(
        [Parameter(Mandatory = $true)][string[]] $PsqlArgs,
        [Parameter(Mandatory = $true)][string]   $Label,
        [switch] $Tolerant
    )
    $stopFlag = 'ON_ERROR_STOP=1'
    if ($ContinueOnError -or $Tolerant) { $stopFlag = 'ON_ERROR_STOP=0' }

    if ($mode -eq 'local') {
        $full = @('exec', '-w', '/dump', $LocalContainerName, 'psql', '-U', 'postgres', '-d', 'postgres', '--variable', $stopFlag) + $PsqlArgs
    }
    else {
        $full = @('run', '--rm', '-v', ('{0}:/dump' -f $restoreDir), '-w', '/dump', 'postgres:17',
                  'psql', '--dbname', $TargetDbUrl, '--variable', $stopFlag) + $PsqlArgs
    }

    Write-Log -Level 'INFO' -Message ('  running {0}' -f $Label)
    $result = Invoke-Native -Exe 'docker' -Arguments $full
    Write-NativeOutput -Lines $result.Output
    return $result.ExitCode
}

function Invoke-RestoreQuery {
    param(
        [Parameter(Mandatory = $true)][string] $Sql,
        [Parameter(Mandatory = $true)][string] $Name
    )
    $queryPath = Join-Path $restoreDir ('_q-' + $Name + '.sql')
    Write-Utf8File -Path $queryPath -Content $Sql

    if ($mode -eq 'local') {
        $full = @('exec', '-w', '/dump', $LocalContainerName, 'psql', '-U', 'postgres', '-d', 'postgres',
                  '-v', 'ON_ERROR_STOP=1', '-At', '-f', ('/dump/_q-{0}.sql' -f $Name))
    }
    else {
        $full = @('run', '--rm', '-v', ('{0}:/dump' -f $restoreDir), '-w', '/dump', 'postgres:17',
                  'psql', '--dbname', $TargetDbUrl, '-v', 'ON_ERROR_STOP=1', '-At', '-f', ('/dump/_q-{0}.sql' -f $Name))
    }

    $result = Invoke-Native -Exe 'docker' -Arguments $full
    Remove-Item -LiteralPath $queryPath -Force -ErrorAction SilentlyContinue
    if ($result.ExitCode -ne 0) {
        Write-NativeOutput -Lines $result.Output
        return $null
    }
    # [string] cast: native output is an ETS-decorated string array on PS 5.1.
    return ([string](($result.Output | ForEach-Object { [string]$_ }) -join "`n")).Trim()
}

# ---------------------------------------------------------------------------
# Step 1 - roles + schema + data
# ---------------------------------------------------------------------------

Write-Log -Level 'STEP' -Message 'Step 1/4  roles + schema + data'

$step1Args = @(
    '--single-transaction',
    '--file', 'roles.sql',
    '--file', 'schema.sql',
    '--command', 'SET session_replication_role = replica',
    '--file', 'data.sql'
)
$step1Exit = Invoke-RestorePsql -PsqlArgs $step1Args -Label 'roles.sql + schema.sql + [replica] + data.sql'
if ($step1Exit -ne 0) {
    Add-Gate -Name 'restore-core' -Passed $false -Detail ('psql exited {0}' -f $step1Exit)
    if (-not $ContinueOnError) {
        Write-Log -Level 'FAIL' -Message 'Core restore failed. --single-transaction means nothing was committed.'
        exit 3
    }
}
else {
    Add-Gate -Name 'restore-core' -Passed $true -Detail 'roles + schema + data applied in one transaction'
}

# ---------------------------------------------------------------------------
# Step 2 - migration ledger
# ---------------------------------------------------------------------------

Write-Log -Level 'STEP' -Message 'Step 2/4  migration ledger'

$step2Args = @('--file', 'history.sql')
if ($hasHistoryData) { $step2Args = $step2Args + @('--file', 'history-data.sql') }
else { Write-Log -Level 'WARN' -Message '  history-data.sql absent - the ledger will restore EMPTY (history.sql is DDL-only).' }

$step2Exit = Invoke-RestorePsql -PsqlArgs $step2Args -Label 'history.sql + history-data.sql'
if ($step2Exit -ne 0) { Add-Gate -Name 'restore-ledger' -Passed $false -Detail ('psql exited {0}' -f $step2Exit) }
else                  { Add-Gate -Name 'restore-ledger' -Passed $true  -Detail 'migration ledger DDL + rows applied' }

# ---------------------------------------------------------------------------
# Step 3 - storage policies
# ---------------------------------------------------------------------------

Write-Log -Level 'STEP' -Message 'Step 3/4  storage policies (catalog-regenerated)'

if (-not $hasStoragePolicies) {
    Add-Gate -Name 'storage-policies' -Passed $false -Detail 'storage-policies.sql missing from the backup set - storage RLS will be ABSENT and every signed-URL path breaks'
}
else {
    # Replaying a create policy that already exists is an error, not a corruption; tolerate it
    # so a re-run over a partially restored target still lands the missing ones.
    $step3Exit = Invoke-RestorePsql -PsqlArgs @('--file', 'storage-policies.sql') -Label 'storage-policies.sql' -Tolerant
    if ($step3Exit -ne 0) { Add-Gate -Name 'storage-policies' -Passed $false -Detail ('psql exited {0}' -f $step3Exit) }
    else                  { Add-Gate -Name 'storage-policies' -Passed $true  -Detail 'applied (count verified in Gate 1)' }
}

# ---------------------------------------------------------------------------
# Step 4 - storage object bytes (optional)
# ---------------------------------------------------------------------------

Write-Log -Level 'STEP' -Message 'Step 4/4  storage object bytes'

$localStorageDir = Join-Path $restoreDir 'storage'
if (-not $RestoreStorage) {
    Write-Log -Level 'INFO' -Message '  skipped (-RestoreStorage not set). Database rows reference objects that must be pushed separately.'
}
elseif (-not (Test-Path -LiteralPath $localStorageDir)) {
    Write-Log -Level 'WARN' -Message '  this backup set contains no storage/ folder - nothing to push.'
}
elseif ($null -eq $rcloneCmd) {
    Write-Log -Level 'WARN' -Message '  rclone not installed - storage bytes NOT restored. Use the official Supabase storage migration Node script instead.'
}
elseif ([string]::IsNullOrWhiteSpace($TargetProjectRef) -or [string]::IsNullOrWhiteSpace($S3AccessKey) -or [string]::IsNullOrWhiteSpace($S3SecretKey)) {
    Write-Log -Level 'WARN' -Message '  need -TargetProjectRef plus target S3 keys (NDT_RESTORE_S3_KEY / NDT_RESTORE_S3_SECRET) - storage bytes NOT restored.'
}
else {
    # Remote-specific env vars ("ndtsupa"), matching db-backup.ps1. The older RCLONE_S3_* form
    # is a BACKEND override that outranks rclone.conf for every s3 remote in the process - it
    # would silently clobber the ndt-aws-restore credentials if the two ever appeared in one
    # command. Scoping the source to its own remote removes that possibility entirely.
    $env:RCLONE_CONFIG_NDTSUPA_TYPE              = 's3'
    $env:RCLONE_CONFIG_NDTSUPA_PROVIDER          = 'Other'
    $env:RCLONE_CONFIG_NDTSUPA_ACCESS_KEY_ID     = $S3AccessKey
    $env:RCLONE_CONFIG_NDTSUPA_SECRET_ACCESS_KEY = $S3SecretKey
    $env:RCLONE_CONFIG_NDTSUPA_ENDPOINT          = ('https://{0}.storage.supabase.co/storage/v1/s3' -f $TargetProjectRef)
    $env:RCLONE_CONFIG_NDTSUPA_REGION            = $S3Region
    try {
        $buckets = Get-ChildItem -LiteralPath $localStorageDir -Directory -ErrorAction SilentlyContinue
        foreach ($bucket in $buckets) {
            Write-Log -Level 'INFO' -Message ('  pushing bucket {0}' -f $bucket.Name)
            $push = Invoke-Native -Exe 'rclone' -Arguments @(
                'copy', $bucket.FullName, ('ndtsupa:' + $bucket.Name), '--checksum', '--stats-one-line', '--stats', '30s'
            )
            Write-NativeOutput -Lines $push.Output
            if ($push.ExitCode -ne 0) {
                Write-Log -Level 'WARN' -Message ('  rclone exited {0} for {1}' -f $push.ExitCode, $bucket.Name)
            }
        }
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
# Gate 1 - verification
# ---------------------------------------------------------------------------

Write-Log -Level 'STEP' -Message 'Gate 1  Verification'

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

$actualRowsRaw    = Invoke-RestoreQuery -Sql $rowCountsSql    -Name 'rows'
$actualPolicyRaw  = Invoke-RestoreQuery -Sql $policyCountsSql -Name 'policies'
$actualHistoryRaw = Invoke-RestoreQuery -Sql $historyCountSql -Name 'history'

function ConvertFrom-JsonOrNull {
    param([string] $Text)
    if ([string]::IsNullOrWhiteSpace($Text)) { return $null }
    try { return (ConvertFrom-Json -InputObject ([string]$Text)) }
    catch { return $null }
}

$actualRows   = ConvertFrom-JsonOrNull -Text $actualRowsRaw
$actualPolicy = ConvertFrom-JsonOrNull -Text $actualPolicyRaw

# --- row counts -------------------------------------------------------------
if ($null -eq $actualRows) {
    Add-Gate -Name 'row-counts' -Passed $false -Detail 'could not read row counts from the target'
}
elseif ($null -eq $manifest -or $null -eq $manifest.database -or $null -eq $manifest.database.rowCounts) {
    $n = @($actualRows.PSObject.Properties).Count
    Add-Gate -Name 'row-counts' -Passed $true -Detail ('{0} tables counted; no manifest baseline to compare against' -f $n)
}
else {
    $mismatches = New-Object System.Collections.ArrayList
    $compared = 0
    foreach ($prop in $manifest.database.rowCounts.PSObject.Properties) {
        $expected = [long]$prop.Value
        $actualProp = $actualRows.PSObject.Properties[$prop.Name]
        if ($null -eq $actualProp) {
            [void]$mismatches.Add(('{0}: table MISSING (expected {1})' -f $prop.Name, $expected))
            continue
        }
        $compared = $compared + 1
        $actual = [long]$actualProp.Value
        if ($actual -ne $expected) {
            [void]$mismatches.Add(('{0}: expected {1}, got {2}' -f $prop.Name, $expected, $actual))
        }
    }
    if ($mismatches.Count -eq 0) {
        Add-Gate -Name 'row-counts' -Passed $true -Detail ('all {0} tables match the manifest baseline' -f $compared)
    }
    else {
        foreach ($m in $mismatches) { Write-Log -Level 'FAIL' -Message ('    {0}' -f $m) }
        Add-Gate -Name 'row-counts' -Passed $false -Detail ('{0} table(s) differ from the manifest baseline' -f $mismatches.Count)
    }
}

# --- policy counts ----------------------------------------------------------
if ($null -eq $actualPolicy) {
    Add-Gate -Name 'policy-counts' -Passed $false -Detail 'could not read pg_policies from the target'
}
else {
    $detail = ('public={0} storage={1} total={2}' -f $actualPolicy.public, $actualPolicy.storage, $actualPolicy.total)
    $policyPass = $true
    if ($null -ne $manifest -and $null -ne $manifest.database -and $null -ne $manifest.database.policyCounts) {
        $expected = $manifest.database.policyCounts
        if ([int]$actualPolicy.public -ne [int]$expected.public) {
            $policyPass = $false
            $detail = $detail + (' | expected public={0}' -f $expected.public)
        }
        if ([int]$actualPolicy.storage -ne [int]$expected.storage) {
            $policyPass = $false
            $detail = $detail + (' | expected storage={0}' -f $expected.storage)
        }
    }
    if ([int]$actualPolicy.storage -eq 0) {
        $policyPass = $false
        $detail = $detail + ' | ZERO storage policies - the known dump gap was not closed'
    }
    Add-Gate -Name 'policy-counts' -Passed $policyPass -Detail $detail
}

# --- migration ledger -------------------------------------------------------
if ([string]::IsNullOrWhiteSpace($actualHistoryRaw)) {
    Add-Gate -Name 'migration-ledger' -Passed $false -Detail 'could not read supabase_migrations.schema_migrations'
}
else {
    $actualHistory = 0
    [void][int]::TryParse($actualHistoryRaw, [ref]$actualHistory)
    $ledgerPass = ($actualHistory -gt 0)
    $detail = ('{0} rows' -f $actualHistory)
    if ($actualHistory -le 0) { $detail = $detail + ' - EMPTY ledger (history-data.sql was missing or failed)' }
    if ($null -ne $manifest -and $null -ne $manifest.database) {
        $expectedHistory = 0
        [void][int]::TryParse([string]$manifest.database.migrationLedgerRows, [ref]$expectedHistory)
        if ($expectedHistory -gt 0 -and $actualHistory -ne $expectedHistory) {
            $ledgerPass = $false
            $detail = $detail + (' | expected {0}' -f $expectedHistory)
        }
    }
    Add-Gate -Name 'migration-ledger' -Passed $ledgerPass -Detail $detail
}

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

Write-Host ''
Write-Log -Level 'STEP' -Message '=== Restore gate summary ==='
$failed = 0
foreach ($gate in $script:Gates) {
    $label = 'PASS'
    if (-not $gate.Passed) { $label = 'FAIL'; $failed = $failed + 1 }
    $line = '  {0}  {1,-20} {2}' -f $label, $gate.Name, $gate.Detail
    if ($gate.Passed) { Write-Host $line -ForegroundColor Green }
    else              { Write-Host $line -ForegroundColor Red }
}

if ($mode -eq 'local') {
    if ($KeepLocalContainer) {
        Write-Log -Level 'INFO' -Message ('Local container "{0}" left running for inspection. Remove with: docker rm -f {0}' -f $LocalContainerName)
    }
    else {
        [void](Invoke-Native -Exe 'docker' -Arguments @('rm', '-f', $LocalContainerName))
        Write-Log -Level 'INFO' -Message ('Local container "{0}" removed.' -f $LocalContainerName)
    }
}

if ($null -ne $extractedTemp) {
    Write-Log -Level 'WARN' -Message ('Decrypted plaintext remains at {0} - delete it once the restore is signed off.' -f $extractedTemp)
}
if ($useS3 -and -not $s3PlanOnly) {
    Write-Log -Level 'WARN' -Message ('Fetched archive remains at {0} - delete it once the restore is signed off.' -f $localSetDir)
}
if ($usePublish -and -not $publishPlanOnly) {
    Write-Log -Level 'WARN' -Message ('Copied archive remains at {0} - delete it once the restore is signed off.' -f $publishCacheDir)
    Write-Log -Level 'INFO' -Message 'Nothing was written into the OneDrive library by this restore.'
}

Write-Host ''
if ($failed -eq 0) {
    Write-Log -Level 'OK' -Message ('ALL {0} GATES PASSED.' -f $script:Gates.Count)
    Write-Log -Level 'INFO' -Message 'Record the date and outcome in docs/processes/disaster-recovery.md (Restore test record).'
    exit 0
}

Write-Log -Level 'FAIL' -Message ('{0} of {1} GATES FAILED - this restore is NOT verified.' -f $failed, $script:Gates.Count)
exit 1
