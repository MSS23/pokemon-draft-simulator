'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Upload, Download, FileText, Check, X, AlertCircle } from 'lucide-react'
import { processCustomPricingFile, downloadSampleCSV, type ParsedCSVResult } from '@/lib/csv-parser'
import { Badge } from '@/components/ui/badge'

interface CSVUploadProps {
  onPricingParsed: (pricing: Record<string, number>, stats: ParsedCSVResult['stats']) => void
  onClear?: () => void
  className?: string
}

export default function CSVUpload({ onPricingParsed, onClear, className }: CSVUploadProps) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [result, setResult] = useState<ParsedCSVResult | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setIsProcessing(true)
    setFileName(file.name)

    try {
      const parseResult = await processCustomPricingFile(file)
      setResult(parseResult)

      if (parseResult.success && parseResult.data && parseResult.stats) {
        onPricingParsed(parseResult.data, parseResult.stats)
      }
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process file'
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleClear = () => {
    setResult(null)
    setFileName(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    onClear?.()
  }

  const triggerFileInput = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className={className}>
      <Card className="p-6 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-slate-800 dark:to-slate-700 border-purple-200 dark:border-purple-800">
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Custom Pricing (CSV)
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Upload a CSV file with custom Pokemon pricing for your draft
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={downloadSampleCSV}
              className="text-xs"
            >
              <Download className="h-3 w-3 mr-1" />
              Template
            </Button>
          </div>

          {/* File Input (Hidden) */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Upload Button or Current File */}
          {!result?.success ? (
            <Button
              onClick={triggerFileInput}
              disabled={isProcessing}
              variant="outline"
              className="w-full bg-white dark:bg-slate-800"
            >
              <Upload className="h-4 w-4 mr-2" />
              {isProcessing ? 'Processing...' : fileName || 'Upload CSV File'}
            </Button>
          ) : (
            <div className="space-y-3">
              {/* Success State */}
              <Alert className="bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700">
                <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                <AlertDescription className="text-sm text-green-800 dark:text-green-200">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{fileName}</span>
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

              {/* Stats Display */}
              {result.stats && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="bg-white dark:bg-slate-800 p-2 rounded border border-slate-200 dark:border-slate-600">
                    <div className="text-xs text-slate-600 dark:text-slate-400">Total</div>
                    <div className="text-lg font-bold text-slate-800 dark:text-slate-100">
                      {result.stats.totalPokemon}
                    </div>
                  </div>
                  <div className="bg-white dark:bg-slate-800 p-2 rounded border border-slate-200 dark:border-slate-600">
                    <div className="text-xs text-slate-600 dark:text-slate-400">Min Cost</div>
                    <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                      {result.stats.minCost}
                    </div>
                  </div>
                  <div className="bg-white dark:bg-slate-800 p-2 rounded border border-slate-200 dark:border-slate-600">
                    <div className="text-xs text-slate-600 dark:text-slate-400">Max Cost</div>
                    <div className="text-lg font-bold text-purple-600 dark:text-purple-400">
                      {result.stats.maxCost}
                    </div>
                  </div>
                  <div className="bg-white dark:bg-slate-800 p-2 rounded border border-slate-200 dark:border-slate-600">
                    <div className="text-xs text-slate-600 dark:text-slate-400">Avg Cost</div>
                    <div className="text-lg font-bold text-green-600 dark:text-green-400">
                      {result.stats.avgCost}
                    </div>
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

          {/* Warning about parsed with errors */}
          {result?.success && result.error && (
            <Alert className="bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-700">
              <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
              <AlertDescription className="text-xs text-yellow-800 dark:text-yellow-200">
                {result.error}
              </AlertDescription>
            </Alert>
          )}

          {/* Info */}
          <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
            <p className="font-medium">Expected CSV format:</p>
            <code className="block bg-white dark:bg-slate-800 p-2 rounded text-xs border border-slate-200 dark:border-slate-600">
              pokemon,cost<br />
              Pikachu,10<br />
              Charizard,25<br />
              Mewtwo,30
            </code>
          </div>
        </div>
      </Card>
    </div>
  )
}
