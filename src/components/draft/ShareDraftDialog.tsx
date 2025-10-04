'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { QRCodeSVG } from 'qrcode.react'
import { Copy, Check, Share2, Download, QrCode } from 'lucide-react'

interface ShareDraftDialogProps {
  isOpen: boolean
  onClose: () => void
  roomCode: string
  draftName?: string
}

export default function ShareDraftDialog({
  isOpen,
  onClose,
  roomCode,
  draftName = 'Pokemon Draft'
}: ShareDraftDialogProps) {
  const [copied, setCopied] = useState(false)
  const [copiedUrl, setCopiedUrl] = useState(false)

  const joinUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/join-draft?code=${roomCode}`
    : ''

  const spectateUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/spectate/${roomCode}`
    : ''

  const handleCopy = (text: string, setter: (value: boolean) => void) => {
    navigator.clipboard.writeText(text)
    setter(true)
    setTimeout(() => setter(false), 2000)
  }

  const handleDownloadQR = () => {
    const svg = document.getElementById('qr-code') as HTMLElement
    if (!svg) return

    const svgData = new XMLSerializer().serializeToString(svg)
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const img = new Image()

    img.onload = () => {
      canvas.width = img.width
      canvas.height = img.height
      ctx?.drawImage(img, 0, 0)
      const pngFile = canvas.toDataURL('image/png')

      const downloadLink = document.createElement('a')
      downloadLink.download = `pokemon-draft-${roomCode}-qr.png`
      downloadLink.href = pngFile
      downloadLink.click()
    }

    img.src = `data:image/svg+xml;base64,${btoa(svgData)}`
  }

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: draftName,
          text: `Join my Pokémon draft! Room Code: ${roomCode}`,
          url: joinUrl
        })
      } catch (error) {
        // User cancelled or share failed
        console.error('Share failed:', error)
      }
    } else {
      handleCopy(joinUrl, setCopiedUrl)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="w-5 h-5" />
            Share Draft Room
          </DialogTitle>
          <DialogDescription>
            Invite others to join your draft or share for spectating
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="join" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="join">Join Link</TabsTrigger>
            <TabsTrigger value="spectate">Spectate Link</TabsTrigger>
          </TabsList>

          <TabsContent value="join" className="space-y-4">
            {/* Room Code */}
            <div className="space-y-2">
              <Label htmlFor="room-code">Room Code</Label>
              <div className="flex gap-2">
                <Input
                  id="room-code"
                  value={roomCode}
                  readOnly
                  className="font-mono text-lg font-bold tracking-wider"
                />
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => handleCopy(roomCode, setCopied)}
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* Join URL */}
            <div className="space-y-2">
              <Label htmlFor="join-url">Join URL</Label>
              <div className="flex gap-2">
                <Input
                  id="join-url"
                  value={joinUrl}
                  readOnly
                  className="text-sm"
                />
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => handleCopy(joinUrl, setCopiedUrl)}
                >
                  {copiedUrl ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* QR Code */}
            <div className="space-y-2">
              <Label>QR Code</Label>
              <div className="flex flex-col items-center gap-4 p-6 bg-gray-50 dark:bg-slate-800 rounded-lg">
                <div className="bg-white p-4 rounded-lg">
                  <QRCodeSVG
                    id="qr-code"
                    value={joinUrl}
                    size={200}
                    level="H"
                    includeMargin={true}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleDownloadQR}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download QR
                  </Button>
                  {navigator.share && (
                    <Button
                      size="sm"
                      onClick={handleShare}
                    >
                      <Share2 className="w-4 h-4 mr-2" />
                      Share
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
              Players can join by entering the room code or scanning the QR code
            </p>
          </TabsContent>

          <TabsContent value="spectate" className="space-y-4">
            {/* Spectate URL */}
            <div className="space-y-2">
              <Label htmlFor="spectate-url">Spectator URL</Label>
              <div className="flex gap-2">
                <Input
                  id="spectate-url"
                  value={spectateUrl}
                  readOnly
                  className="text-sm"
                />
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => handleCopy(spectateUrl, setCopiedUrl)}
                >
                  {copiedUrl ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* QR Code for Spectating */}
            <div className="space-y-2">
              <Label>Spectator QR Code</Label>
              <div className="flex flex-col items-center gap-4 p-6 bg-gray-50 dark:bg-slate-800 rounded-lg">
                <div className="bg-white p-4 rounded-lg">
                  <QRCodeSVG
                    value={spectateUrl}
                    size={200}
                    level="H"
                    includeMargin={true}
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDownloadQR}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download QR
                </Button>
              </div>
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
              Share this link for people to watch the draft without participating
            </p>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
