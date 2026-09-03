import { useEffect, useState } from 'react'
import QRCodeGenerator from 'qrcode'
import { cn } from '@/lib/utils'

export function QRCode({ value, size = 180, className }: { value: string; size?: number; className?: string }) {
  const [source, setSource] = useState('')

  useEffect(() => {
    let active = true
    QRCodeGenerator.toDataURL(value, {
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0D0D12', light: '#FFFFFF' },
    }).then((dataUrl) => { if (active) setSource(dataUrl) })
    return () => { active = false }
  }, [value, size])

  return source ? (
    <img src={source} alt="QR Code para abrir o canal no WatchQueue" width={size} height={size} className={cn('rounded-xl bg-white', className)} />
  ) : (
    <span aria-label="Gerando QR Code" className={cn('block animate-pulse rounded-xl bg-white/10', className)} style={{ width: size, height: size }} />
  )
}
