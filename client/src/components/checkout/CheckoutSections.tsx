import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { FileText } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

/**
 * The checkout form's sections.
 *
 * Nobody signs in to reach checkout, so this form is the only record we will
 * have of a guest: everything an invoice needs is asked for here, once, and
 * nothing that it does not need.
 */

export interface CheckoutForm {
  firstName: string
  lastName: string
  email: string
  phone: string
  position: string
  company: string
  street: string
  line2: string
  zip: string
  city: string
  /** ISO code. Germany only for now — the only place we invoice to. */
  country: string
  vatId: string
  poNumber: string
  sameAsBilling: boolean
  deliveryStreet: string
  deliveryLine2: string
  deliveryZip: string
  deliveryCity: string
  neededBy: string
  notes: string
  privacyAccepted: boolean
}

export function emptyCheckoutForm(prefill: {
  name?: string | null
  email?: string | null
  company?: string | null
}): CheckoutForm {
  const [first, ...rest] = (prefill.name ?? '').trim().split(/\s+/)
  return {
    firstName: first ?? '',
    lastName: rest.join(' '),
    email: prefill.email ?? '',
    phone: '',
    position: '',
    company: prefill.company ?? '',
    street: '',
    line2: '',
    zip: '',
    city: '',
    country: 'DE',
    vatId: '',
    poNumber: '',
    sameAsBilling: true,
    deliveryStreet: '',
    deliveryLine2: '',
    deliveryZip: '',
    deliveryCity: '',
    neededBy: '',
    notes: '',
    privacyAccepted: false,
  }
}

export const PRIVACY_URL =
  import.meta.env.VITE_PRIVACY_URL?.trim() || 'https://biglittlethings.de/datenschutz/'

interface SectionProps {
  form: CheckoutForm
  set: <K extends keyof CheckoutForm>(key: K, value: CheckoutForm[K]) => void
  disabled?: boolean
}

function Field(props: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  required?: boolean
  type?: string
  autoComplete?: string
  hint?: ReactNode
  placeholder?: string
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-2">
      <Label htmlFor={props.id}>
        {props.label}
        {!props.required && (
          <span className="font-normal text-muted-foreground">
            {' '}
            {t('checkout.optional')}
          </span>
        )}
      </Label>
      <Input
        id={props.id}
        type={props.type ?? 'text'}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        autoComplete={props.autoComplete}
        placeholder={props.placeholder}
        required={props.required}
      />
      {props.hint && <p className="text-xs text-muted-foreground">{props.hint}</p>}
    </div>
  )
}

function Section({
  title,
  disabled,
  children,
}: {
  title: string
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <fieldset className="space-y-4" disabled={disabled}>
      <legend className="font-display text-lg font-semibold">{title}</legend>
      {children}
    </fieldset>
  )
}

export function ContactSection({ form, set, disabled }: SectionProps) {
  const { t } = useTranslation()
  return (
    <Section title={t('checkout.contact')} disabled={disabled}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="firstName"
          label={t('checkout.firstName')}
          value={form.firstName}
          onChange={(v) => set('firstName', v)}
          autoComplete="given-name"
          required
        />
        <Field
          id="lastName"
          label={t('checkout.lastName')}
          value={form.lastName}
          onChange={(v) => set('lastName', v)}
          autoComplete="family-name"
          required
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="email"
          type="email"
          label={t('checkout.email')}
          value={form.email}
          onChange={(v) => set('email', v)}
          autoComplete="email"
          hint={t('checkout.emailHint')}
          required
        />
        <Field
          id="phone"
          type="tel"
          label={t('checkout.phone')}
          value={form.phone}
          onChange={(v) => set('phone', v)}
          autoComplete="tel"
          hint={t('checkout.phoneHint')}
          required
        />
      </div>
      <Field
        id="position"
        label={t('checkout.position')}
        value={form.position}
        onChange={(v) => set('position', v)}
        autoComplete="organization-title"
      />
    </Section>
  )
}

export function BillingSection({ form, set, disabled }: SectionProps) {
  const { t } = useTranslation()
  return (
    <Section title={t('checkout.billing')} disabled={disabled}>
      <Field
        id="company"
        label={t('checkout.company')}
        value={form.company}
        onChange={(v) => set('company', v)}
        autoComplete="organization"
        required
      />
      <Field
        id="street"
        label={t('checkout.street')}
        value={form.street}
        onChange={(v) => set('street', v)}
        autoComplete="billing address-line1"
        required
      />
      <Field
        id="line2"
        label={t('checkout.line2')}
        value={form.line2}
        onChange={(v) => set('line2', v)}
        autoComplete="billing address-line2"
      />
      <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
        <Field
          id="zip"
          label={t('checkout.zip')}
          value={form.zip}
          onChange={(v) => set('zip', v)}
          autoComplete="billing postal-code"
          required
        />
        <Field
          id="city"
          label={t('checkout.city')}
          value={form.city}
          onChange={(v) => set('city', v)}
          autoComplete="billing address-level2"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="country">{t('checkout.country')}</Label>
        <Input id="country" value={t('checkout.germany')} readOnly disabled />
        <p className="text-xs text-muted-foreground">{t('checkout.germanyOnly')}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="vatId"
          label={t('checkout.vatId')}
          value={form.vatId}
          onChange={(v) => set('vatId', v)}
          placeholder="DE123456789"
        />
        <Field
          id="poNumber"
          label={t('checkout.poNumber')}
          value={form.poNumber}
          onChange={(v) => set('poNumber', v)}
          hint={t('checkout.poNumberHint')}
        />
      </div>
    </Section>
  )
}

export function DeliverySection({ form, set, disabled }: SectionProps) {
  const { t } = useTranslation()
  return (
    <Section title={t('checkout.delivery')} disabled={disabled}>
      <label className="flex items-center gap-2.5 text-sm">
        <Checkbox
          checked={form.sameAsBilling}
          onCheckedChange={(v) => set('sameAsBilling', v === true)}
        />
        {t('checkout.sameAsBilling')}
      </label>
      {!form.sameAsBilling && (
        <div className="space-y-4 rounded-brand border border-border/40 p-4">
          <Field
            id="deliveryStreet"
            label={t('checkout.street')}
            value={form.deliveryStreet}
            onChange={(v) => set('deliveryStreet', v)}
            autoComplete="shipping address-line1"
            required
          />
          <Field
            id="deliveryLine2"
            label={t('checkout.line2')}
            value={form.deliveryLine2}
            onChange={(v) => set('deliveryLine2', v)}
            autoComplete="shipping address-line2"
          />
          <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
            <Field
              id="deliveryZip"
              label={t('checkout.zip')}
              value={form.deliveryZip}
              onChange={(v) => set('deliveryZip', v)}
              autoComplete="shipping postal-code"
              required
            />
            <Field
              id="deliveryCity"
              label={t('checkout.city')}
              value={form.deliveryCity}
              onChange={(v) => set('deliveryCity', v)}
              autoComplete="shipping address-level2"
              required
            />
          </div>
        </div>
      )}
      {/* The first thing a quote has to answer, and the thing people forget
          to mention until it is too late to make. */}
      <div className="sm:max-w-[240px]">
        <Field
          id="neededBy"
          type="date"
          label={t('checkout.neededBy')}
          value={form.neededBy}
          onChange={(v) => set('neededBy', v)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="notes">
          {t('checkout.notes')}
          <span className="font-normal text-muted-foreground"> {t('checkout.optional')}</span>
        </Label>
        <Textarea
          id="notes"
          rows={3}
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          placeholder={t('checkout.notesPlaceholder')}
        />
      </div>
    </Section>
  )
}

/** Information, not a choice — invoice is the only way to pay for now. */
export function PaymentSection({ disabled }: { disabled?: boolean }) {
  const { t } = useTranslation()
  return (
    <Section title={t('checkout.payment')} disabled={disabled}>
      <div className="flex gap-3 rounded-brand border border-primary/40 bg-primary/5 p-4">
        <FileText className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="space-y-1 text-sm">
          <p className="font-medium">{t('checkout.payByInvoice')}</p>
          <p className="text-muted-foreground">{t('checkout.payByInvoiceBody')}</p>
        </div>
      </div>
    </Section>
  )
}

export function PrivacyConsent({ form, set, disabled }: SectionProps) {
  const { t } = useTranslation()
  return (
    <label className="flex items-start gap-2.5 text-sm">
      <Checkbox
        className="mt-0.5"
        checked={form.privacyAccepted}
        onCheckedChange={(v) => set('privacyAccepted', v === true)}
        disabled={disabled}
        required
        aria-required
      />
      <span className="text-muted-foreground">
        {t('checkout.privacyBefore')}{' '}
        <a
          href={PRIVACY_URL}
          target="_blank"
          rel="noreferrer"
          className="text-foreground underline underline-offset-2"
        >
          {t('checkout.privacyLink')}
        </a>{' '}
        {t('checkout.privacyAfter')}
      </span>
    </label>
  )
}
