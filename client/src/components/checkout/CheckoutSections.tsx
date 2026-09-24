import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { FileText } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { FieldMessage, FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { ZodForm } from '@/lib/form'
import type { CheckoutValues } from '@/lib/schemas/checkout'
import { todayIso } from '@/lib/schemas/common'

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

/** The checkout form, as `useZodForm` hands it to each section. */
export type CheckoutFormState = ZodForm<CheckoutForm, CheckoutValues>

interface SectionProps {
  f: CheckoutFormState
  disabled?: boolean
}

type TextField = {
  [K in keyof CheckoutForm]: CheckoutForm[K] extends string ? K : never
}[keyof CheckoutForm]

function Field(props: {
  f: CheckoutFormState
  name: TextField
  label: string
  optional?: boolean
  type?: string
  autoComplete?: string
  inputMode?: 'text' | 'numeric' | 'tel' | 'email'
  maxLength?: number
  min?: string
  hint?: ReactNode
  placeholder?: string
}) {
  const { t } = useTranslation()
  const field = props.f.register(props.name)
  return (
    <FormField
      id={field.id}
      label={props.label}
      error={props.f.errors[props.name]}
      hint={props.hint}
      optional={props.optional}
      optionalLabel={t('checkout.optional')}
    >
      <Input
        {...field}
        type={props.type ?? 'text'}
        autoComplete={props.autoComplete}
        inputMode={props.inputMode}
        maxLength={props.maxLength}
        min={props.min}
        placeholder={props.placeholder}
        aria-required={props.optional ? undefined : true}
      />
    </FormField>
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

export function ContactSection({ f, disabled }: SectionProps) {
  const { t } = useTranslation()
  return (
    <Section title={t('checkout.contact')} disabled={disabled}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field f={f} name="firstName" label={t('checkout.firstName')} autoComplete="given-name" />
        <Field f={f} name="lastName" label={t('checkout.lastName')} autoComplete="family-name" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          f={f}
          name="email"
          type="email"
          inputMode="email"
          label={t('checkout.email')}
          autoComplete="email"
          placeholder={t('checkout.emailPlaceholder')}
          hint={t('checkout.emailHint')}
        />
        <Field
          f={f}
          name="phone"
          type="tel"
          inputMode="tel"
          label={t('checkout.phone')}
          autoComplete="tel"
          placeholder="+49 30 1234567"
          hint={t('checkout.phoneHint')}
        />
      </div>
      <Field
        f={f}
        name="position"
        label={t('checkout.position')}
        autoComplete="organization-title"
        optional
      />
    </Section>
  )
}

export function BillingSection({ f, disabled }: SectionProps) {
  const { t } = useTranslation()
  return (
    <Section title={t('checkout.billing')} disabled={disabled}>
      <Field
        f={f}
        name="company"
        label={t('checkout.company')}
        autoComplete="organization"
        hint={t('checkout.companyHint')}
      />
      <Field
        f={f}
        name="street"
        label={t('checkout.street')}
        autoComplete="billing address-line1"
        placeholder={t('checkout.streetPlaceholder')}
      />
      <Field
        f={f}
        name="line2"
        label={t('checkout.line2')}
        autoComplete="billing address-line2"
        optional
      />
      <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
        <Field
          f={f}
          name="zip"
          label={t('checkout.zip')}
          autoComplete="billing postal-code"
          inputMode="numeric"
          maxLength={5}
          placeholder="10115"
        />
        <Field f={f} name="city" label={t('checkout.city')} autoComplete="billing address-level2" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="country">{t('checkout.country')}</Label>
        <Input id="country" value={t('checkout.germany')} readOnly disabled />
        <p className="text-xs text-muted-foreground">{t('checkout.germanyOnly')}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          f={f}
          name="vatId"
          label={t('checkout.vatId')}
          placeholder="DE123456789"
          hint={t('checkout.vatIdHint')}
          optional
        />
        <Field
          f={f}
          name="poNumber"
          label={t('checkout.poNumber')}
          hint={t('checkout.poNumberHint')}
          optional
        />
      </div>
    </Section>
  )
}

export function DeliverySection({ f, disabled }: SectionProps) {
  const { t } = useTranslation()
  const notes = f.register('notes')
  return (
    <Section title={t('checkout.delivery')} disabled={disabled}>
      <label className="flex items-center gap-2.5 text-sm">
        <Checkbox {...f.registerCheckbox('sameAsBilling')} />
        {t('checkout.sameAsBilling')}
      </label>
      {!f.values.sameAsBilling && (
        <div className="space-y-4 rounded-brand border border-border/40 p-4">
          <Field
            f={f}
            name="deliveryStreet"
            label={t('checkout.street')}
            autoComplete="shipping address-line1"
            placeholder={t('checkout.streetPlaceholder')}
          />
          <Field
            f={f}
            name="deliveryLine2"
            label={t('checkout.line2')}
            autoComplete="shipping address-line2"
            optional
          />
          <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
            <Field
              f={f}
              name="deliveryZip"
              label={t('checkout.zip')}
              autoComplete="shipping postal-code"
              inputMode="numeric"
              maxLength={5}
              placeholder="10115"
            />
            <Field
              f={f}
              name="deliveryCity"
              label={t('checkout.city')}
              autoComplete="shipping address-level2"
            />
          </div>
        </div>
      )}
      {/* The first thing a quote has to answer, and the thing people forget
          to mention until it is too late to make. */}
      <div className="sm:max-w-[240px]">
        <Field
          f={f}
          name="neededBy"
          type="date"
          min={todayIso()}
          label={t('checkout.neededBy')}
          hint={t('checkout.neededByHint')}
          optional
        />
      </div>
      <FormField
        id={notes.id}
        label={t('checkout.notes')}
        error={f.errors.notes}
        optional
        optionalLabel={t('checkout.optional')}
      >
        <Textarea {...notes} rows={3} placeholder={t('checkout.notesPlaceholder')} />
      </FormField>
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

export function PrivacyConsent({ f, disabled }: SectionProps) {
  const { t } = useTranslation()
  const checkbox = f.registerCheckbox('privacyAccepted')
  return (
    <div className="space-y-2">
      <label className="flex items-start gap-2.5 text-sm">
        <Checkbox className="mt-0.5" {...checkbox} disabled={disabled} aria-required />
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
      <FieldMessage id={checkbox.id} error={f.errors.privacyAccepted} />
    </div>
  )
}
