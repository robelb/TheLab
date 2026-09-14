import { useTranslation } from 'react-i18next'
import { useRef } from 'react'
import { ImagePlus, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const ACCEPTED = 'image/jpeg,image/png,image/webp,image/gif'
const MAX_BYTES = 10 * 1024 * 1024 // 10MB — stays under the backend body limit

interface ImageSearchProps {
  /** Called with a `data:<mime>;base64,...` URL when a valid image is chosen. */
  onSearch: (dataUrl: string) => void
  onClear: () => void
  isSearching: boolean
  previewUrl: string | null
  onError: (message: string) => void
  className?: string
}

/**
 * Rejects with a code rather than a sentence: this runs outside the component,
 * where there is no translator, and the caller is the one showing the message.
 */
const READ_FAILED = 'IMAGE_READ_FAILED'

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error(READ_FAILED))
    reader.readAsDataURL(file)
  })
}

export function ImageSearch({
  onSearch,
  onClear,
  isSearching,
  previewUrl,
  onError,
  className,
}: ImageSearchProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File | undefined) {
    if (!file) return
    if (!ACCEPTED.split(',').includes(file.type)) {
      onError(t('filters.imageUnsupported'))
      return
    }
    if (file.size > MAX_BYTES) {
      onError(t('filters.imageTooLarge'))
      return
    }
    try {
      onSearch(await readAsDataUrl(file))
    } catch (err) {
      onError(
        err instanceof Error && err.message !== READ_FAILED
          ? err.message
          : t('filters.imageReadFailed'),
      )
    }
  }

  function clear() {
    onClear()
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
        aria-label={t('filters.uploadImage')}
      />

      {previewUrl ? (
        <div className="relative size-12 shrink-0 overflow-hidden rounded-brand border border-border/50">
          <img
            src={previewUrl}
            alt="Search reference"
            className="size-full object-cover"
          />
          {isSearching && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/60">
              <Loader2 className="size-4 animate-spin text-foreground" />
            </div>
          )}
          <button
            type="button"
            onClick={clear}
            className="absolute right-0 top-0 flex size-4 items-center justify-center rounded-bl-brand bg-background/80 text-foreground hover:bg-background"
            aria-label={t('filters.clearImageSearch')}
          >
            <X className="size-3" />
          </button>
        </div>
      ) : null}

      <Button
        type="button"
        variant="outline"
        className="h-12 shrink-0 gap-2"
        onClick={() => inputRef.current?.click()}
        disabled={isSearching}
      >
        {isSearching ? (
          <Loader2 className="size-5 animate-spin" />
        ) : (
          <ImagePlus className="size-5" />
        )}
        <span className="hidden sm:inline">Search by image</span>
      </Button>
    </div>
  )
}
