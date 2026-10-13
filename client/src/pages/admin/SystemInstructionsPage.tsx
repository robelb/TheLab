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
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
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
import { formatDateTime } from '@/utils/format'

function statusOf(
  i: SystemInstructionView,
  t: TFunction,
): {
  label: string
  variant: 'default' | 'secondary' | 'outline'
} {
  if (!i.override)
    return {
      label: t('dashboard.admin.systemInstructions.status.builtIn'),
      variant: 'secondary',
    }
  if (i.override.isActive)
    return {
      label: t('dashboard.admin.systemInstructions.status.custom'),
      variant: 'default',
    }
  return {
    label: t('dashboard.admin.systemInstructions.status.customOff'),
    variant: 'outline',
  }
}

function Editor({ instruction }: { instruction: SystemInstructionView }) {
  const { t } = useTranslation()
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
              ? t('dashboard.admin.systemInstructions.savedActive')
              : t('dashboard.admin.systemInstructions.savedInactive'),
          ),
        onError: (err) =>
          toast.error(
            err instanceof Error
              ? err.message
              : t('dashboard.admin.systemInstructions.saveFailed'),
          ),
      },
    )

  const doRevert = () =>
    remove.mutate(instruction.key, {
      onSuccess: () => {
        setRevertOpen(false)
        setContent(instruction.defaultTemplate)
        toast.success(t('dashboard.admin.systemInstructions.reverted'))
      },
      onError: (err) =>
        toast.error(
          err instanceof Error
            ? err.message
            : t('dashboard.admin.systemInstructions.revertFailed'),
        ),
    })

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{instruction.title}</CardTitle>
          <Badge
            variant={statusOf(instruction, t).variant}
            className="text-[10px] uppercase"
          >
            {statusOf(instruction, t).label}
          </Badge>
        </div>
        <CardDescription>{instruction.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {instruction.placeholders.length > 0 && (
          <div className="space-y-1.5 rounded-brand border border-border/40 bg-muted/20 p-3">
            <p className="text-xs font-medium">
              {t('dashboard.admin.systemInstructions.placeholdersIntro')}
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
            {instruction.override
              ? t('dashboard.admin.systemInstructions.saveOverride')
              : t('dashboard.admin.systemInstructions.saveAsOverride')}
          </Button>

          {instruction.override && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => doSave(!active)}
              disabled={busy}
              title={
                active
                  ? t('dashboard.admin.systemInstructions.disableTitle')
                  : t('dashboard.admin.systemInstructions.enableTitle')
              }
            >
              {active ? (
                <CircleOff className="size-4" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              {active
                ? t('dashboard.admin.systemInstructions.disable')
                : t('dashboard.admin.systemInstructions.enable')}
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setContent(instruction.defaultTemplate)}
            disabled={busy || content === instruction.defaultTemplate}
            title={t('dashboard.admin.systemInstructions.loadBuiltInTitle')}
          >
            <FileText className="size-4" />
            {t('dashboard.admin.systemInstructions.loadBuiltIn')}
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
              {t('dashboard.admin.systemInstructions.revertToBuiltIn')}
            </Button>
          )}

          {dirty && (
            <span className="text-xs text-muted-foreground">
              {t('dashboard.admin.systemInstructions.unsaved')}
            </span>
          )}
        </div>

        {instruction.override && (
          <p className="text-xs text-muted-foreground">
            {t('dashboard.admin.systemInstructions.lastSaved', {
              date: formatDateTime(instruction.override.updatedAt),
            })}
          </p>
        )}
      </CardContent>

      <AlertDialog open={revertOpen} onOpenChange={setRevertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('dashboard.admin.systemInstructions.revertTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('dashboard.admin.systemInstructions.revertBody', {
                title: instruction.title,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>
              {t('dashboard.admin.common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault()
                doRevert()
              }}
            >
              {remove.isPending
                ? t('dashboard.admin.systemInstructions.reverting')
                : t('dashboard.admin.systemInstructions.revert')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

export function SystemInstructionsPage() {
  const { t } = useTranslation()
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
          {t('dashboard.admin.systemInstructions.title')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t('dashboard.admin.systemInstructions.subtitle')}
        </p>
      </header>

      {error && (
        <p className="rounded-brand border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error instanceof Error
            ? error.message
            : t('dashboard.admin.systemInstructions.loadFailed')}
        </p>
      )}

      {isLoading && <Skeleton className="h-96 rounded-brand" />}

      {instructions && instructions.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-[260px_1fr] lg:items-start">
          <nav
            aria-label={t('dashboard.admin.systemInstructions.navAria')}
            className="space-y-1 lg:sticky lg:top-20"
          >
            {instructions.map((i) => {
              const status = statusOf(i, t)
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
