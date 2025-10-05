# PowerShell Deployment Script for Pokémon Draft League
# Run this to deploy to Vercel production

Write-Host "🚀 Pokémon Draft League - Deployment Script" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check if we're in the right directory
if (-not (Test-Path "package.json")) {
    Write-Host "❌ Error: package.json not found" -ForegroundColor Red
    Write-Host "Please run this script from the pokemon-draft directory" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Current directory verified" -ForegroundColor Green
Write-Host ""

# Step 2: Check for uncommitted changes
Write-Host "📝 Checking for uncommitted changes..." -ForegroundColor Yellow
$gitStatus = git status --porcelain
if ($gitStatus) {
    Write-Host "⚠️  You have uncommitted changes:" -ForegroundColor Yellow
    git status --short
    Write-Host ""
    $commit = Read-Host "Would you like to commit them now? (y/n)"
    if ($commit -eq "y") {
        $message = Read-Host "Enter commit message"
        git add -A
        git commit -m "$message"
        Write-Host "✅ Changes committed" -ForegroundColor Green
    }
}
Write-Host ""

# Step 3: Check environment variables
Write-Host "🔐 Checking Vercel environment variables..." -ForegroundColor Yellow
$envVars = vercel env ls 2>&1

if ($envVars -match "NEXT_PUBLIC_SUPABASE_URL") {
    Write-Host "✅ Supabase variables configured" -ForegroundColor Green
} else {
    Write-Host "❌ Supabase variables not found" -ForegroundColor Red
    Write-Host "Please set up Supabase environment variables first" -ForegroundColor Yellow
    exit 1
}

if ($envVars -match "NEXT_PUBLIC_SENTRY_DSN") {
    Write-Host "✅ Sentry configured" -ForegroundColor Green
} else {
    Write-Host "⚠️  Sentry not configured (optional)" -ForegroundColor Yellow
    Write-Host "   App will deploy without error tracking" -ForegroundColor Gray
}
Write-Host ""

# Step 4: Run tests
Write-Host "🧪 Running tests..." -ForegroundColor Yellow
$testResult = npm test -- --run 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ All tests passed" -ForegroundColor Green
} else {
    Write-Host "⚠️  Some tests failed, but continuing..." -ForegroundColor Yellow
}
Write-Host ""

# Step 5: Build locally to verify
Write-Host "🔨 Testing production build..." -ForegroundColor Yellow
$buildResult = npm run build 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Build successful" -ForegroundColor Green
} else {
    Write-Host "❌ Build failed" -ForegroundColor Red
    Write-Host "Please fix build errors before deploying" -ForegroundColor Yellow
    exit 1
}
Write-Host ""

# Step 6: Deploy to Vercel
Write-Host "🚀 Deploying to Vercel production..." -ForegroundColor Cyan
Write-Host ""
$deploy = Read-Host "Ready to deploy? (y/n)"
if ($deploy -ne "y") {
    Write-Host "Deployment cancelled" -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "Deploying..." -ForegroundColor Yellow
vercel --prod

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "=============================================" -ForegroundColor Cyan
    Write-Host "✅ Deployment Successful!" -ForegroundColor Green
    Write-Host "=============================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "1. Visit your deployment URL" -ForegroundColor White
    Write-Host "2. Run smoke tests (create draft, join, make pick)" -ForegroundColor White
    Write-Host "3. Test PWA installation" -ForegroundColor White
    Write-Host "4. Test offline mode" -ForegroundColor White
    Write-Host "5. Check Sentry dashboard (if configured)" -ForegroundColor White
    Write-Host ""
    Write-Host "📚 See DEPLOYMENT_INSTRUCTIONS.md for detailed verification steps" -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "❌ Deployment failed" -ForegroundColor Red
    Write-Host "Check the error messages above" -ForegroundColor Yellow
    exit 1
}
