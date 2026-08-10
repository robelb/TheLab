import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import {
  CheckCircle2,
  CircleOff,
  FileText,
  Loader2,
  RotateCcw,
  Save,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/context/AuthContext'
import {
  useDeleteSystemInstruction,
  useSaveSystemInstruction,
  useSystemInstructions,
} from '@/hooks/use-system-instructions'
import type { SystemInstructionView } from '@/api/systemInstructions'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

function statusOf(i: SystemInstructionView): {
  label: string
  variant: 'default' | 'secondary' | 'outline'
} {
  if (!i.override) return { label: 'Built-in', variant: 'secondary' }
  if (i.override.isActive) return { label: 'Custom', variant: 'default' }
  return { label: 'Custom (off)', variant: 'outline' }
}

function Editor({ instruction }: { instruction: SystemInstructionView }) {
  const save = useSaveSystemInstruction()
  const remove = useDeleteSystemInstruction()
  const [revertOpen, setRevertOpen] = useState(false)

  // Editor starts from the active override, else the built-in template.
  const baseline = instruction.override?.content ?? instruction.defaultTemplate
  const [content, setContent] = useState(baseline)
  useEffect(() => setContent(baseline), [baseline])

  const dirty = content !== baseline
  const busy = save.isPending || remove.isPending
  const active = instruction.override?.isActive ?? false

  const doSave = (isActive: boolean) =>
    save.mutate(
      { key: instruction.key, content, isActive },
      {
        onSuccess: () =>
          toast.success(
            isActive
              ? 'Override saved — used for new generations.'
              : 'Override saved but disabled — built-in prompt is used.',
          ),
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : 'Save failed'),
      },
    )

  const doRevert = () =>
    remove.mutate(instruction.key, {
      onSuccess: () => {
        setRevertOpen(false)
        setContent(instruction.defaultTemplate)
        toast.success('Override removed — the built-in prompt applies again.')
      },
      onError: (err) =>
        toast.error(err instanceof Error ? err.message : 'Revert failed'),
    })

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{instruction.title}</CardTitle>
          <Badge
            variant={statusOf(instruction).variant}
            className="text-[10px] uppercase"
          >
            {statusOf(instruction).label}
          </Badge>
        </div>
        <CardDescription>{instruction.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {instruction.placeholders.length > 0 && (
          <div className="space-y-1.5 rounded-brand border border-border/40 bg-muted/20 p-3">
            <p className="text-xs font-medium">
              Placeholders — replaced with live data at generation time:
            </p>
            <ul className="space-y-1">
              {instruction.placeholders.map((p) => (
                <li key={p.name} className="text-xs text-muted-foreground">
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">
                    {`{{${p.name}}}`}
                  </code>{' '}
                  {p.description}
                </li>
              ))}
            </ul>
          </div>
        )}

        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={22}
          spellCheck={false}
          className="font-mono text-xs leading-relaxed"
          disabled={busy}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => doSave(true)}
            disabled={busy || !content.trim()}
          >
            {save.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            {instruction.override ? 'Save override' : 'Save as override'}
          </Button>

          {instruction.override && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => doSave(!active)}
              disabled={busy}
              title={
                active
                  ? 'Keep the text but use the built-in prompt'
                  : 'Use this override for new generations'
              }
            >
              {active ? (
                <CircleOff className="size-4" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              {active ? 'Disable override' : 'Enable override'}
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setContent(instruction.defaultTemplate)}
            disabled={busy || content === instruction.defaultTemplate}
            title="Reset the editor to the built-in template (does not save)"
          >
            <FileText className="size-4" />
            Load built-in template
          </Button>

          {instruction.override && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setRevertOpen(true)}
              disabled={busy}
            >
              <RotateCcw className="size-4" />
              Revert to built-in
            </Button>
          )}

          {dirty && (
            <span className="text-xs text-muted-foreground">
              Unsaved changes
            </span>
          )}
        </div>

        {instruction.override && (
          <p className="text-xs text-muted-foreground">
            Override last saved{' '}
            {new Date(instruction.override.updatedAt).toLocaleString()}. New
            generations pick changes up within ~15 seconds.
          </p>
        )}
      </CardContent>

      <AlertDialog open={revertOpen} onOpenChange={setRevertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revert to the built-in prompt?</AlertDialogTitle>
            <AlertDialogDescription>
              The custom override for “{instruction.title}” will be deleted and
              the built-in prompt will be used again. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault()
                doRevert()
              }}
            >
              {remove.isPending ? 'Reverting…' : 'Revert'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

export function SystemInstructionsPage() {
  const { can } = useAuth()
  const { data: instructions, isLoading, error } = useSystemInstructions()
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const selected = useMemo(
    () =>
      instructions?.find((i) => i.key === selectedKey) ?? instructions?.[0],
    [instructions, selectedKey],
  )

  if (!can('manage_all')) return <Navigate to="/dashboard" replace />

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-bold">
          System instructions
        </h1>
        <p className="text-sm text-muted-foreground">
          The AI prompts behind image generation, campaign copy and brand
          extraction. Overrides apply platform-wide, to every company — the
          built-in prompt is always the fallback.
        </p>
      </header>

      {error && (
        <p className="rounded-brand border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error instanceof Error
            ? error.message
            : 'Failed to load instructions'}
        </p>
      )}

      {isLoading && <Skeleton className="h-96 rounded-brand" />}

      {instructions && instructions.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-[260px_1fr] lg:items-start">
          <nav
            aria-label="Instructions"
            className="space-y-1 lg:sticky lg:top-20"
          >
            {instructions.map((i) => {
              const status = statusOf(i)
              const isSelected = i.key === selected?.key
              return (
                <button
                  key={i.key}
                  type="button"
                  onClick={() => setSelectedKey(i.key)}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-brand border px-3 py-2.5 text-left text-sm transition-colors',
                    isSelected
                      ? 'border-primary/40 bg-primary/5 font-medium'
                      : 'border-border/40 hover:bg-muted/40',
                  )}
                >
                  <span className="min-w-0 truncate">{i.title}</span>
                  <Badge
                    variant={status.variant}
                    className="shrink-0 text-[9px] uppercase"
                  >
                    {status.label}
                  </Badge>
                </button>
              )
            })}
          </nav>

          {selected && <Editor key={selected.key} instruction={selected} />}
        </div>
      )}
    </div>
  )
}
