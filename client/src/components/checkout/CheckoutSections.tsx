import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { FileText, Mail, Package, Truck, Users } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { DatePicker } from '@/components/ui/date-picker'
import { FieldMessage, FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { ZodForm } from '@/lib/form'
import type { CheckoutValues } from '@/lib/schemas/checkout'
import { todayInBerlin } from '@/lib/schemas/common'
import {
  countryOptions,
  INVOICE_COUNTRIES,
  SHIPPING_COUNTRIES,
  shippingCost,
  vatIdPrefix,
  vatIdRequired,
  type ShippingMethod,
} from '@/lib/shipping'
import { cn } from '@/lib/utils'
import { formatPrice } from '@/utils/format'

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
  /** ISO code of the invoice address. Decides the VAT. */
  country: string
  vatId: string
  poNumber: string
  shippingMethod: ShippingMethod
  /** Mixed shipping: how many boxes go to the delivery address. A string while typed. */
  bulkBoxes: string
  sameAsBilling: boolean
  deliveryStreet: string
  deliveryLine2: string
  deliveryZip: string
  deliveryCity: string
  /** Where the boxes go — for individual shipping, where the recipients are. */
  deliveryCountry: string
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
    shippingMethod: 'bulk',
    bulkBoxes: '',
    sameAsBilling: true,
    deliveryStreet: '',
    deliveryLine2: '',
    deliveryZip: '',
    deliveryCity: '',
    deliveryCountry: 'DE',
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

/** A country picker, as a native select so it works with typing and autofill. */
function CountrySelect(props: {
  f: CheckoutFormState
  name: 'country' | 'deliveryCountry'
  label: string
  codes: readonly string[]
  autoComplete?: string
  hint?: ReactNode
}) {
  const { t, i18n } = useTranslation()
  const field = props.f.register(props.name)
  return (
    <FormField
      id={field.id}
      label={props.label}
      error={props.f.errors[props.name]}
      hint={props.hint}
      optionalLabel={t('checkout.optional')}
    >
      <select
        {...field}
        autoComplete={props.autoComplete}
        className="flex h-10 w-full rounded-brand border border-input bg-background/50 px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive"
      >
        {countryOptions(props.codes, i18n.language).map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </select>
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
          inputMode={f.values.country === 'DE' ? 'numeric' : 'text'}
          maxLength={f.values.country === 'DE' ? 5 : 10}
          placeholder={f.values.country === 'DE' ? '10115' : undefined}
        />
        <Field f={f} name="city" label={t('checkout.city')} autoComplete="billing address-level2" />
      </div>
      {/* The invoice country decides the VAT: German VAT at home, none for
          other countries — inside the EU only on the buyer's VAT ID. */}
      <CountrySelect
        f={f}
        name="country"
        label={t('checkout.country')}
        codes={INVOICE_COUNTRIES}
        autoComplete="billing country"
        hint={
          f.values.country === 'DE'
            ? t('checkout.countryHintDe')
            : vatIdRequired(f.values.country)
              ? t('checkout.countryHintEu')
              : t('checkout.countryHintNonEu')
        }
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          f={f}
          name="vatId"
          label={t('checkout.vatId')}
          placeholder={`${vatIdPrefix(f.values.country)}123456789`}
          hint={
            vatIdRequired(f.values.country)
              ? t('checkout.vatIdRequiredHint')
              : t('checkout.vatIdHint')
          }
          optional={!vatIdRequired(f.values.country)}
        />
        <Field
          f={f}
          name="poNumber"
          label={t('checkout.poNumber')}
          hint={t('checkout.poNumberLater')}
          optional
        />
      </div>
    </Section>
  )
}

/**
 * How the boxes travel: all to one address, one box per recipient, or some of
 * each. Recipient addresses are never typed in here — someone ordering for a
 * hundred people sends the list afterwards — so individual shipping asks only
 * where the recipients are, for the estimate.
 */
export function DeliverySection({
  f,
  disabled,
  boxes,
  looseItems = false,
  currency,
}: SectionProps & { boxes: number; looseItems?: boolean; currency: string }) {
  const { t } = useTranslation()
  const notes = f.register('notes')
  const neededBy = f.register('neededBy')
  const bulkBoxes = f.register('bulkBoxes')
  // Matches CheckoutPage: a cart with single products cannot go individually.
  const method =
    looseItems && f.values.shippingMethod === 'individual' ? 'bulk' : f.values.shippingMethod
  const destination =
    f.values.sameAsBilling && method !== 'individual'
      ? f.values.country
      : f.values.deliveryCountry
  const together = Number(f.values.bulkBoxes) || 1

  const methods: {
    value: ShippingMethod
    icon: typeof Truck
    title: string
    body: string
    available: boolean
  }[] = [
    {
      value: 'bulk',
      icon: Package,
      title: t('checkout.shipBulk'),
      body: t('checkout.shipBulkBody'),
      available: true,
    },
    {
      value: 'individual',
      icon: Users,
      title: t('checkout.shipIndividual'),
      body: t('checkout.shipIndividualBody'),
      // A single product has no recipient of its own to go to.
      available: boxes >= 1 && !looseItems,
    },
    {
      value: 'mixed',
      icon: Truck,
      title: t('checkout.shipMixed'),
      body: t('checkout.shipMixedBody'),
      available: boxes >= 2,
    },
  ]

  return (
    <Section title={t('checkout.delivery')} disabled={disabled}>
      {boxes > 0 && (
        <div role="radiogroup" aria-label={t('checkout.shippingMethod')} className="grid gap-3 sm:grid-cols-3">
          {methods
            .filter((m) => m.available)
            .map((m) => {
              const selected = method === m.value
              const estimate = shippingCost({
                method: m.value,
                country: destination,
                boxes,
                bulkBoxes: m.value === 'mixed' ? together : null,
              })
              const Icon = m.icon
              return (
                <button
                  key={m.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => f.set('shippingMethod', m.value)}
                  className={cn(
                    'flex flex-col gap-1.5 rounded-brand border p-3 text-left transition-colors',
                    selected
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-border/60 hover:border-border',
                  )}
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Icon className="size-4 text-primary" />
                    {m.title}
                  </span>
                  <span className="text-xs text-foreground/70">{m.body}</span>
                  {estimate !== null && (
                    <span className="mt-auto pt-1 text-xs font-medium tabular-nums">
                      {t('checkout.shipFrom', { price: formatPrice(estimate, currency) })}
                    </span>
                  )}
                </button>
              )
            })}
        </div>
      )}
      {boxes > 0 && looseItems && (
        <p className="text-xs text-muted-foreground">{t('checkout.shipIndividualLoose')}</p>
      )}

      {method === 'mixed' && (
        <div className="grid gap-4 sm:grid-cols-[200px_1fr] sm:items-end">
          <FormField
            id={bulkBoxes.id}
            label={t('checkout.bulkBoxes')}
            error={f.errors.bulkBoxes}
            hint={t('checkout.bulkBoxesHint', { total: boxes })}
          >
            <Input {...bulkBoxes} type="number" inputMode="numeric" min={1} max={boxes - 1} />
          </FormField>
          <p className="pb-2 text-sm text-foreground/70">
            {t('checkout.individualRest', {
              count: Math.max(0, boxes - (Number(f.values.bulkBoxes) || 0)),
            })}
          </p>
        </div>
      )}

      {method !== 'bulk' && (
        <div className="flex gap-3 rounded-brand border border-primary/40 bg-primary/5 p-4">
          <Mail className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="space-y-1 text-sm">
            <p className="font-medium">{t('checkout.addressesLater')}</p>
            <p className="text-foreground/70">{t('checkout.addressesLaterBody')}</p>
          </div>
        </div>
      )}

      {method === 'individual' ? (
        <CountrySelect
          f={f}
          name="deliveryCountry"
          label={t('checkout.recipientsCountry')}
          codes={SHIPPING_COUNTRIES}
          hint={t('checkout.recipientsCountryHint')}
        />
      ) : (
        <>
          {method === 'mixed' && (
            <p className="text-sm font-medium">{t('checkout.bulkAddress')}</p>
          )}
          <label className="flex items-center gap-2.5 text-sm">
            <Checkbox {...f.registerCheckbox('sameAsBilling')} />
            {t('checkout.sameAsBilling')}
          </label>
          <FieldMessage id={f.idOf('sameAsBilling')} error={f.errors.sameAsBilling} />
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
                  inputMode={f.values.deliveryCountry === 'DE' ? 'numeric' : 'text'}
                  maxLength={f.values.deliveryCountry === 'DE' ? 5 : 10}
                  placeholder={f.values.deliveryCountry === 'DE' ? '10115' : undefined}
                />
                <Field
                  f={f}
                  name="deliveryCity"
                  label={t('checkout.city')}
                  autoComplete="shipping address-level2"
                />
              </div>
              <CountrySelect
                f={f}
                name="deliveryCountry"
                label={t('checkout.country')}
                codes={SHIPPING_COUNTRIES}
                autoComplete="shipping country"
                hint={t('checkout.shipEuOnly')}
              />
            </div>
          )}
        </>
      )}
      {/* The first thing a quote has to answer, and the thing people forget
          to mention until it is too late to make. */}
      <FormField
        id={neededBy.id}
        label={t('checkout.neededBy')}
        error={f.errors.neededBy}
        hint={t('checkout.neededByHint')}
        optional
        optionalLabel={t('checkout.optional')}
        className="sm:max-w-[240px]"
      >
        <DatePicker
          id={neededBy.id}
          value={neededBy.value}
          onChange={(value) => f.set('neededBy', value)}
          onBlur={neededBy.onBlur}
          min={todayInBerlin()}
          clearable
          aria-invalid={neededBy['aria-invalid']}
          aria-describedby={neededBy['aria-describedby']}
        />
      </FormField>
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
