'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Download, FileText, FileJson, FileSpreadsheet, Copy, Check } from 'lucide-react'
import {
  downloadDraftJSON,
  downloadDraftCSV,
  downloadDraftSummary,
  copyDraftSummaryToClipboard,
  type ExportDraftData
} from '@/lib/draft-export'
import { useNotify } from '@/components/providers/NotificationProvider'

interface ExportDraftProps {
  exportData: ExportDraftData
  className?: string
}

export default function ExportDraft({ exportData, className }: ExportDraftProps) {
  const [isCopying, setIsCopying] = useState(false)
  const [copied, setCopied] = useState(false)
  const notify = useNotify()

  const handleCopyToClipboard = async () => {
    setIsCopying(true)
    try {
      const success = await copyDraftSummaryToClipboard(exportData)
      if (success) {
        setCopied(true)
        notify.success('Copied!', 'Draft summary copied to clipboard')
        setTimeout(() => setCopied(false), 3000)
      } else {
        notify.error('Copy Failed', 'Could not copy to clipboard')
      }
    } catch (error) {
      notify.error('Copy Failed', 'Could not copy to clipboard')
    } finally {
      setIsCopying(false)
    }
  }

  return (
    <Card className={`p-4 bg-white dark:bg-slate-800 ${className}`}>
      <div className="space-y-4">
        {/* Header */}
        <div>
          <h3 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Download className="h-5 w-5" />
            Export Draft
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Download or share your draft results
          </p>
        </div>

        {/* Export Options */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* JSON Export */}
          <Button
            variant="outline"
            onClick={() => downloadDraftJSON(exportData)}
            className="flex items-center justify-start gap-2 h-auto py-3"
          >
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded">
              <FileJson className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="text-left">
              <div className="font-medium text-sm">JSON</div>
              <div className="text-xs text-slate-600 dark:text-slate-400">
                Full draft data
              </div>
            </div>
          </Button>

          {/* CSV Export */}
          <Button
            variant="outline"
            onClick={() => downloadDraftCSV(exportData)}
            className="flex items-center justify-start gap-2 h-auto py-3"
          >
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded">
              <FileSpreadsheet className="h-4 w-4 text-green-600 dark:text-green-400" />
            </div>
            <div className="text-left">
              <div className="font-medium text-sm">CSV</div>
              <div className="text-xs text-slate-600 dark:text-slate-400">
                Pick history
              </div>
            </div>
          </Button>

          {/* Text Summary */}
          <Button
            variant="outline"
            onClick={() => downloadDraftSummary(exportData)}
            className="flex items-center justify-start gap-2 h-auto py-3"
          >
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded">
              <FileText className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="text-left">
              <div className="font-medium text-sm">Text Summary</div>
              <div className="text-xs text-slate-600 dark:text-slate-400">
                Formatted report
              </div>
            </div>
          </Button>

          {/* Copy to Clipboard */}
          <Button
            variant="outline"
            onClick={handleCopyToClipboard}
            disabled={isCopying}
            className="flex items-center justify-start gap-2 h-auto py-3"
          >
            <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded">
              {copied ? (
                <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
              ) : (
                <Copy className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              )}
            </div>
            <div className="text-left">
              <div className="font-medium text-sm">
                {copied ? 'Copied!' : 'Copy Summary'}
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400">
                To clipboard
              </div>
            </div>
          </Button>
        </div>

        {/* Info */}
        <div className="text-xs text-slate-600 dark:text-slate-400 pt-2 border-t border-slate-200 dark:border-slate-700">
          <p className="flex items-center gap-1">
            <FileText className="h-3 w-3" />
            Export formats include all teams, picks, and statistics
          </p>
        </div>
      </div>
    </Card>
  )
}
