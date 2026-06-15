import { GripVertical, ImagePlus, Loader2, Star, Upload, X } from 'lucide-react'
import { useRef, useState, type DragEvent } from 'react'
import { fileToDataUrl, uploadImages } from '@/api/uploads'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface ImageManagerProps {
  images: string[]
  onChange: (images: string[]) => void
}

export function ImageManager({ images, onChange }: ImageManagerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDropTarget, setIsDropTarget] = useState(false)
  const [urlInput, setUrlInput] = useState('')

  // Reorder state for the thumbnail grid (native HTML5 drag-and-drop).
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  const handleFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (list.length === 0) return

    setError(null)
    setUploading(true)
    try {
      const dataUrls = await Promise.all(list.map(fileToDataUrl))
      const urls = await uploadImages(dataUrls)
      onChange([...images, ...urls])
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ??
        (err as Error)?.message ??
        'Upload failed'
      setError(message)
    } finally {
      setUploading(false)
    }
  }

  const onFileDrop = (e: DragEvent) => {
    e.preventDefault()
    setIsDropTarget(false)
    if (e.dataTransfer.files?.length) {
      void handleFiles(e.dataTransfer.files)
    }
  }

  const addUrl = () => {
    const url = urlInput.trim()
    if (!url) return
    onChange([...images, url])
    setUrlInput('')
  }

  const removeAt = (index: number) =>
    onChange(images.filter((_, i) => i !== index))

  const reorder = (from: number, to: number) => {
    if (from === to) return
    const next = [...images]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    onChange(next)
  }

  const onThumbDrop = (e: DragEvent, index: number) => {
    e.preventDefault()
    if (dragIndex !== null) reorder(dragIndex, index)
    setDragIndex(null)
    setOverIndex(null)
  }

  return (
    <div className="space-y-4">
      {/* Upload / drop zone */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click()
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDropTarget(true)
        }}
        onDragLeave={() => setIsDropTarget(false)}
        onDrop={onFileDrop}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-brand border-2 border-dashed border-border px-6 py-8 text-center transition-colors hover:border-primary/50 hover:bg-muted/30',
          isDropTarget && 'border-primary bg-primary/5',
        )}
      >
        {uploading ? (
          <Loader2 className="size-6 animate-spin text-primary" />
        ) : (
          <Upload className="size-6 text-muted-foreground" />
        )}
        <p className="text-sm font-medium">
          {uploading ? 'Uploading…' : 'Drop images here or click to upload'}
        </p>
        <p className="text-xs text-muted-foreground">
          PNG, JPG or WebP — multiple files supported
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {/* Add by URL */}
      <div className="flex gap-2">
        <Input
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addUrl()
            }
          }}
          placeholder="…or paste an image URL"
        />
        <Button type="button" variant="outline" onClick={addUrl}>
          <ImagePlus className="size-4" />
          Add
        </Button>
      </div>

      {error && (
        <p className="rounded-brand border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Thumbnail grid (drag to reorder) */}
      {images.length === 0 ? (
        <p className="rounded-brand border border-border/40 bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
          No images yet. The first image becomes the product cover.
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Drag to reorder — the first image is the cover.
          </p>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {images.map((src, index) => (
              <div
                key={`${src}-${index}`}
                draggable
                onDragStart={() => setDragIndex(index)}
                onDragEnter={() => setOverIndex(index)}
                onDragOver={(e) => e.preventDefault()}
                onDragEnd={() => {
                  setDragIndex(null)
                  setOverIndex(null)
                }}
                onDrop={(e) => onThumbDrop(e, index)}
                className={cn(
                  'group relative aspect-square overflow-hidden rounded-brand border border-border/40 bg-muted/20',
                  dragIndex === index && 'opacity-40',
                  overIndex === index &&
                    dragIndex !== index &&
                    'ring-2 ring-primary',
                )}
              >
                <img
                  src={src}
                  alt=""
                  className="h-full w-full object-cover"
                  draggable={false}
                />

                <span className="absolute left-1 top-1 flex size-5 items-center justify-center rounded bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100">
                  <GripVertical className="size-3.5" />
                </span>

                {index === 0 && (
                  <span className="absolute bottom-1 left-1 flex items-center gap-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                    <Star className="size-2.5" />
                    Cover
                  </span>
                )}

                <button
                  type="button"
                  aria-label="Remove image"
                  onClick={() => removeAt(index)}
                  className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity hover:bg-destructive group-hover:opacity-100"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
