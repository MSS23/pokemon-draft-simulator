'use client'

import { useState } from 'react'
import { Pokemon } from '@/types'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Download, FileJson, FileText, FileSpreadsheet, File, Clipboard, Check } from 'lucide-react'
import { ExportService, TeamExport } from '@/lib/export-service'
import { toast } from 'sonner'

interface TeamExportButtonProps {
  teamName: string
  pokemon: Pokemon[]
  totalCost: number
  budgetRemaining: number
  formatId?: string
  draftName?: string
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'default' | 'sm' | 'lg'
}

export default function TeamExportButton({
  teamName,
  pokemon,
  totalCost,
  budgetRemaining,
  formatId,
  draftName,
  variant = 'outline',
  size = 'default'
}: TeamExportButtonProps) {
  const [copied, setCopied] = useState(false)

  const teamData: TeamExport = {
    teamName,
    pokemon,
    totalCost,
    budgetRemaining,
    formatId,
    draftName,
    exportDate: new Date().toISOString()
  }

  const handleExport = (format: 'json' | 'csv' | 'showdown' | 'markdown' | 'html') => {
    try {
      switch (format) {
        case 'json':
          ExportService.exportAsJSON(teamData)
          toast.success('Team exported as JSON')
          break
        case 'csv':
          ExportService.exportAsCSV(teamData)
          toast.success('Team exported as CSV')
          break
        case 'showdown':
          ExportService.exportAsShowdown(teamData)
          toast.success('Team exported as Showdown format')
          break
        case 'markdown':
          ExportService.exportAsMarkdown(teamData)
          toast.success('Team exported as Markdown')
          break
        case 'html':
          ExportService.exportAsHTML(teamData)
          toast.success('Team exported as HTML (printable)')
          break
      }
    } catch (error) {
      console.error('Export error:', error)
      toast.error('Failed to export team')
    }
  }

  const handleCopyToClipboard = async () => {
    try {
      await ExportService.copyToClipboard(teamData)
      setCopied(true)
      toast.success('Team copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Copy error:', error)
      toast.error('Failed to copy to clipboard')
    }
  }

  if (pokemon.length === 0) {
    return null
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} className="gap-2">
          <Download className="h-4 w-4" />
          Export Team
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Export Format</DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={() => handleExport('json')} className="cursor-pointer">
          <FileJson className="h-4 w-4 mr-2" />
          JSON Format
          <span className="ml-auto text-xs text-gray-500">.json</span>
        </DropdownMenuItem>

        <DropdownMenuItem onClick={() => handleExport('csv')} className="cursor-pointer">
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          CSV Spreadsheet
          <span className="ml-auto text-xs text-gray-500">.csv</span>
        </DropdownMenuItem>

        <DropdownMenuItem onClick={() => handleExport('showdown')} className="cursor-pointer">
          <FileText className="h-4 w-4 mr-2" />
          Showdown Format
          <span className="ml-auto text-xs text-gray-500">.txt</span>
        </DropdownMenuItem>

        <DropdownMenuItem onClick={() => handleExport('markdown')} className="cursor-pointer">
          <File className="h-4 w-4 mr-2" />
          Markdown
          <span className="ml-auto text-xs text-gray-500">.md</span>
        </DropdownMenuItem>

        <DropdownMenuItem onClick={() => handleExport('html')} className="cursor-pointer">
          <File className="h-4 w-4 mr-2" />
          HTML (Printable)
          <span className="ml-auto text-xs text-gray-500">.html</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={handleCopyToClipboard} className="cursor-pointer">
          {copied ? (
            <>
              <Check className="h-4 w-4 mr-2 text-green-600" />
              <span className="text-green-600">Copied!</span>
            </>
          ) : (
            <>
              <Clipboard className="h-4 w-4 mr-2" />
              Copy to Clipboard
            </>
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
