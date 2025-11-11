# Build Verification Hooks Setup

> **Purpose**: Automatically enforce code quality after every change

---

## What Are Hooks?

Hooks are automated scripts that run after specific events (like tool use, file edits, or commits) to enforce quality standards without manual intervention.

---

## Recommended Hooks for NDT Suite

### 1. Build Verification Hook (Highest Priority)

**Runs**: After file edits
**Purpose**: Catch TypeScript/build errors immediately

**Setup in VS Code Settings**:

File: `.vscode/settings.json` (or User Settings)

```json
{
  "claudeCode.hooks": {
    "afterToolUse": [
      {
        "name": "Build Checker",
        "tools": ["Edit", "Write"],
        "command": "npm run build",
        "continueOnError": true,
        "message": "⚠️ Build check: {{ exitCode === 0 ? '✅ Success' : '❌ Failed - Fix errors before continuing' }}"
      }
    ]
  }
}
```

**What it does**:
- Runs `npm run build` after Edit or Write tool use
- Shows success/failure message
- Doesn't block if build fails (continueOnError: true)
- Reminds you to fix errors

---

### 2. File Edit Tracker Hook

**Runs**: After file edits
**Purpose**: Log which files were modified (helps with git commits)

```json
{
  "claudeCode.hooks": {
    "afterToolUse": [
      {
        "name": "File Edit Tracker",
        "tools": ["Edit", "Write"],
        "command": "echo Modified: {{ toolUse.parameters.file_path }}",
        "silent": false
      }
    ]
  }
}
```

---

### 3. Lint Check Hook

**Runs**: After file edits
**Purpose**: Ensure code follows style guidelines

```json
{
  "claudeCode.hooks": {
    "afterToolUse": [
      {
        "name": "Lint Checker",
        "tools": ["Edit", "Write"],
        "command": "npm run lint",
        "continueOnError": true,
        "throttle": 5000
      }
    ]
  }
}
```

**Note**: `throttle: 5000` prevents running lint on every single edit (waits 5 seconds)

---

### 4. Security Check Reminder Hook

**Runs**: Before git commits
**Purpose**: Remind to check for security issues

```json
{
  "claudeCode.hooks": {
    "beforeToolUse": [
      {
        "name": "Security Reminder",
        "tools": ["Bash"],
        "commandPattern": "git commit",
        "message": "🔒 Security Checklist:\n- SQL injection prevention?\n- XSS prevention?\n- Input validation?\n- No exposed secrets?\n- RLS policies correct?"
      }
    ]
  }
}
```

---

## Complete Hooks Configuration

Paste this into `.vscode/settings.json`:

```json
{
  "claudeCode.hooks": {
    "afterToolUse": [
      {
        "name": "Build Checker",
        "description": "Run build after file changes to catch errors early",
        "tools": ["Edit", "Write"],
        "command": "npm run build",
        "continueOnError": true,
        "throttle": 3000,
        "message": "Build: {{ exitCode === 0 ? '✅ Success' : '❌ Failed - run /build-and-fix' }}"
      },
      {
        "name": "Lint Checker",
        "description": "Check code style after edits",
        "tools": ["Edit", "Write"],
        "command": "npm run lint",
        "continueOnError": true,
        "throttle": 5000,
        "silent": true
      }
    ],
    "beforeToolUse": [
      {
        "name": "Commit Security Reminder",
        "description": "Security checklist before commits",
        "tools": ["Bash"],
        "commandPattern": "git commit",
        "message": "🔒 Security check:\n✓ SQL injection?\n✓ XSS?\n✓ Input validation?\n✓ No secrets?",
        "continueOnError": true
      }
    ]
  }
}
```

---

## Hook Parameters Explained

### Common Parameters

- **`name`**: Hook display name
- **`tools`**: Which tools trigger this hook (Edit, Write, Bash, etc.)
- **`command`**: Shell command to run
- **`continueOnError`**: true = don't block on failure, false = stop execution
- **`silent`**: true = don't show output, false = show output
- **`throttle`**: Minimum milliseconds between runs (prevents spam)
- **`message`**: Custom message to display
- **`commandPattern`**: Regex to match specific commands (for Bash tool)

### Variables Available in Hooks

- `{{ exitCode }}` - Command exit code (0 = success)
- `{{ stdout }}` - Command output
- `{{ stderr }}` - Command error output
- `{{ toolUse.parameters.file_path }}` - File being edited
- `{{ toolUse.parameters.command }}` - Bash command being run

---

## Setup Steps

### Option 1: Project-level (Recommended)

1. Create `.vscode/settings.json` in project root:
   ```bash
   mkdir .vscode
   # Create settings.json with hooks config
   ```

2. Add to `.gitignore` (if you want hooks to be personal):
   ```
   .vscode/settings.json
   ```

   OR commit to git (if you want team to use same hooks):
   ```bash
   git add .vscode/settings.json
   git commit -m "Add Claude Code quality hooks"
   ```

### Option 2: User-level (Global)

1. Open VS Code settings (Ctrl+,)
2. Search for "claude code hooks"
3. Edit in settings.json
4. Paste hooks configuration

---

## Testing Hooks

After setup:

1. **Test build hook**:
   - Edit any .js/.jsx file
   - Save changes
   - Should see "Build: ✅ Success" or "Build: ❌ Failed"

2. **Test lint hook**:
   - Edit file with style issues
   - Should see lint warnings (if not silent)

3. **Test commit hook**:
   - Run `git commit`
   - Should see security reminder before commit

---

## Customizing Hooks

### Make build hook block on failure

```json
{
  "continueOnError": false  // Change to false
}
```

Now Claude will STOP if build fails (more strict).

### Add type checking hook

```json
{
  "name": "TypeScript Checker",
  "tools": ["Edit", "Write"],
  "command": "npm run typecheck",
  "continueOnError": true,
  "throttle": 5000
}
```

### Add test runner hook

```json
{
  "name": "Test Runner",
  "tools": ["Edit", "Write"],
  "command": "npm test",
  "continueOnError": true,
  "throttle": 10000
}
```

---

## Advanced: User Prompt Submit Hook

This hook analyzes user prompts and reminds Claude to use skills:

```json
{
  "claudeCode.hooks": {
    "userPromptSubmit": [
      {
        "name": "Skill Activation Reminder",
        "script": "if (prompt.includes('security')) { return 'Remember to use /review-security command'; }"
      }
    ]
  }
}
```

---

## Troubleshooting Hooks

### Hook not running

**Check**:
- Hook is in correct section (afterToolUse vs beforeToolUse)
- Tool name is correct (Edit, Write, Bash)
- Command is valid and in PATH
- throttle isn't blocking it

### Hook causing errors

**Fix**:
- Set `continueOnError: true`
- Check command works in terminal
- Add `silent: true` to hide output

### Hook running too often

**Fix**:
- Increase `throttle` value (milliseconds)
- Make `silent: true`
- Only run on specific tools

---

## Best Practices

### Do:
- ✅ Use `continueOnError: true` for non-critical checks
- ✅ Use `throttle` to prevent spam
- ✅ Test hooks thoroughly before enforcing
- ✅ Document what each hook does
- ✅ Start with reminders, not blockers

### Don't:
- ❌ Make every hook blocking (too frustrating)
- ❌ Run expensive commands without throttling
- ❌ Add hooks you won't actually use
- ❌ Forget to test hooks after adding

---

## Recommended Progression

**Week 1**: Build checker (reminder mode)
```json
{ "continueOnError": true }  // Just warns
```

**Week 2**: Build checker (strict mode)
```json
{ "continueOnError": false }  // Blocks on error
```

**Week 3**: Add lint checker

**Week 4**: Add security reminder

**Later**: Add test runner, type checker, custom hooks

---

## Hooks + Slash Commands + Dev Docs = Complete System

**Hooks** enforce quality automatically
**Slash commands** handle manual workflows
**Dev docs** preserve context across sessions

Together they ensure:
- No broken builds
- Security checks done
- Code quality maintained
- Progress never lost

---

## Example: Complete Workflow

1. User: "Add new feature"
2. Claude: Creates dev docs (`/dev-docs`)
3. Claude: Implements feature
4. **Hook**: Build checker runs after each file edit
5. **Hook**: Shows "✅ Build success" or "❌ Build failed"
6. Claude: Fixes errors if build failed
7. User: "Review this"
8. Claude: Runs `/code-review` and `/review-security`
9. User: "Commit it"
10. **Hook**: Security reminder before commit
11. Claude: Runs `/commit-and-push`

---

## Need Help?

- Check Claude Code docs: https://docs.claude.com/en/docs/claude-code
- Check this file: HOOKS_SETUP.md
- Ask: "How do I configure a hook to X?"

---

**Created**: 2025-11-11
**Last Updated**: 2025-11-11
