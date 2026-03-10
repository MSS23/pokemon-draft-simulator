'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Upload, Download, FileText, Check, X, AlertCircle, Link, Loader2 } from 'lucide-react'
import {
  processCustomPricingFile,
  downloadSampleCSV,
  fetchGoogleSheetCSV,
  isGoogleSheetsUrl,
  type ParsedCSVResult,
  type TierInfo,
} from '@/lib/csv-parser'

interface CSVUploadProps {
  onPricingParsed: (pricing: Record<string, number>, stats: ParsedCSVResult['stats'], extra?: { banned?: string[]; tiers?: TierInfo[] }) => void
  onClear?: () => void
  className?: string
}

type InputMode = 'file' | 'url'

export default function CSVUpload({ onPricingParsed, onClear, className }: CSVUploadProps) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [result, setResult] = useState<ParsedCSVResult | null>(null)
  const [sourceName, setSourceName] = useState<string | null>(null)
  const [inputMode, setInputMode] = useState<InputMode>('file')
  const [sheetUrl, setSheetUrl] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleResult = (parseResult: ParsedCSVResult) => {
    setResult(parseResult)
    if (parseResult.success && parseResult.data && parseResult.stats) {
      onPricingParsed(parseResult.data, parseResult.stats, {
        banned: parseResult.banned,
        tiers: parseResult.tiers,
      })
    }
  }

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setIsProcessing(true)
    setSourceName(file.name)

    try {
      handleResult(await processCustomPricingFile(file))
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process file',
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleSheetFetch = async () => {
    if (!sheetUrl.trim()) return

    if (!isGoogleSheetsUrl(sheetUrl)) {
      setResult({ success: false, error: 'Please enter a valid Google Sheets URL' })
      return
    }

    setIsProcessing(true)
    setSourceName('Google Sheet')

    try {
      handleResult(await fetchGoogleSheetCSV(sheetUrl))
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch sheet',
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleClear = () => {
    setResult(null)
    setSourceName(null)
    setSheetUrl('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    onClear?.()
  }

  return (
    <div className={className}>
      <Card className="p-4 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-muted dark:to-secondary border-purple-200 dark:border-purple-800">
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Import Draft Pool
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                CSV file or Google Sheets link
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={downloadSampleCSV}
              className="text-xs h-7"
            >
              <Download className="h-3 w-3 mr-1" />
              Template
            </Button>
          </div>

          {/* Input (hidden when successful) */}
          {!result?.success && (
            <>
              {/* Mode Toggle */}
              <div className="flex gap-1 p-0.5 bg-muted rounded-md">
                <button
                  type="button"
                  onClick={() => setInputMode('file')}
                  className={`flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded transition-colors ${
                    inputMode === 'file'
                      ? 'bg-white dark:bg-card shadow-sm font-medium'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Upload className="h-3 w-3" />
                  Upload CSV
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('url')}
                  className={`flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded transition-colors ${
                    inputMode === 'url'
                      ? 'bg-white dark:bg-card shadow-sm font-medium'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Link className="h-3 w-3" />
                  Google Sheets
                </button>
              </div>

              {/* File Upload */}
              {inputMode === 'file' && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isProcessing}
                    variant="outline"
                    className="w-full bg-white dark:bg-card"
                  >
                    {isProcessing ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    {isProcessing ? 'Processing...' : 'Choose CSV File'}
                  </Button>
                </>
              )}

              {/* Google Sheets URL */}
              {inputMode === 'url' && (
                <div className="flex gap-2">
                  <Input
                    type="url"
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    value={sheetUrl}
                    onChange={(e) => setSheetUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSheetFetch()}
                    className="bg-white dark:bg-card text-xs h-9"
                    disabled={isProcessing}
                  />
                  <Button
                    type="button"
                    onClick={handleSheetFetch}
                    disabled={isProcessing || !sheetUrl.trim()}
                    size="sm"
                    className="h-9 px-3 shrink-0"
                  >
                    {isProcessing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Import'
                    )}
                  </Button>
                </div>
              )}
            </>
          )}

          {/* Success State */}
          {result?.success && (
            <div className="space-y-2.5">
              <Alert className="bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700">
                <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                <AlertDescription className="text-sm text-green-800 dark:text-green-200">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{sourceName}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleClear}
                      className="h-6 text-xs text-green-700 dark:text-green-300 hover:text-green-900 dark:hover:text-green-100"
                    >
                      <X className="h-3 w-3 mr-1" />
                      Remove
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>

              {/* Stats */}
              {result.stats && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="bg-white dark:bg-card p-2 rounded border border-border">
                    <div className="text-xs text-muted-foreground">Total</div>
                    <div className="text-lg font-bold text-foreground">{result.stats.totalPokemon}</div>
                  </div>
                  <div className="bg-white dark:bg-card p-2 rounded border border-border">
                    <div className="text-xs text-muted-foreground">Min Cost</div>
                    <div className="text-lg font-bold text-blue-600 dark:text-blue-400">{result.stats.minCost}</div>
                  </div>
                  <div className="bg-white dark:bg-card p-2 rounded border border-border">
                    <div className="text-xs text-muted-foreground">Max Cost</div>
                    <div className="text-lg font-bold text-purple-600 dark:text-purple-400">{result.stats.maxCost}</div>
                  </div>
                  <div className="bg-white dark:bg-card p-2 rounded border border-border">
                    <div className="text-xs text-muted-foreground">Avg Cost</div>
                    <div className="text-lg font-bold text-green-600 dark:text-green-400">{result.stats.avgCost}</div>
                  </div>
                </div>
              )}

              {/* Tier Breakdown */}
              {result.tiers && result.tiers.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-muted-foreground">Tier Breakdown</div>
                  <div className="flex flex-wrap gap-1.5">
                    {result.tiers.map(tier => (
                      <div
                        key={tier.name}
                        className="bg-white dark:bg-card px-2 py-1 rounded border border-border text-xs"
                      >
                        <span className="font-semibold">{tier.name}</span>
                        <span className="text-muted-foreground ml-1">({tier.cost}pts)</span>
                        <span className="ml-1 text-muted-foreground">&middot; {tier.count}</span>
                      </div>
                    ))}
                    {result.banned && result.banned.length > 0 && (
                      <div className="bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded border border-red-200 dark:border-red-800 text-xs">
                        <span className="font-semibold text-red-700 dark:text-red-300">Banned</span>
                        <span className="ml-1 text-red-600 dark:text-red-400">&middot; {result.banned.length}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error State */}
          {result && !result.success && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                <div className="flex items-center justify-between">
                  <span>{result.error}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClear}
                    className="h-6 text-xs"
                  >
                    <X className="h-3 w-3 mr-1" />
                    Clear
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Warning */}
          {result?.success && result.error && (
            <Alert className="bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-700">
              <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
              <AlertDescription className="text-xs text-yellow-800 dark:text-yellow-200">
                {result.error}
              </AlertDescription>
            </Alert>
          )}

          {/* Help text (only show when no result) */}
          {!result?.success && (
            <p className="text-xs text-muted-foreground">
              {inputMode === 'url'
                ? 'Sheet must be shared publicly. Supports tiered columns like "S Tier (60)" or simple "pokemon,cost" format.'
                : 'Supports tiered columns like "S Tier (60), A Tier (50), ..." or simple "pokemon,cost" format.'}
            </p>
          )}
        </div>
      </Card>
    </div>
  )
}
