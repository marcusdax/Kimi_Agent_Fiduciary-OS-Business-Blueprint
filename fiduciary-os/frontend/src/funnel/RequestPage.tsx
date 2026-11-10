import { useRef, useState, type FormEvent } from "react";
import FunnelLayout from "./FunnelLayout";
import {
  contactMethods,
  emptyRequest,
  goals,
  helpOptions,
  lifeStages,
  plans,
  recommendPlan,
  timelines,
  validateRequest,
  type PlanId,
  type RequestErrors,
  type RequestForm,
} from "./request";

const fieldOrder: (keyof RequestForm)[] = [
  "goal",
  "stage",
  "timeline",
  "help",
  "contactMethod",
  "name",
  "email",
  "phone",
  "consent",
];
const firstId: Record<keyof RequestForm, string> = {
  goal: "fx-goal-0",
  stage: "fx-stage-0",
  timeline: "fx-timeline",
  help: "fx-help-0",
  contactMethod: "fx-contactMethod-0",
  name: "fx-name",
  email: "fx-email",
  phone: "fx-phone",
  consent: "fx-consent",
};

function Choices({
  name,
  legend,
  options,
  value,
  error,
  onChange,
}: {
  name: keyof RequestForm;
  legend: string;
  options: string[];
  value: string;
  error?: string;
  onChange: (v: string) => void;
}) {
  return (
    <fieldset
      className="fx-fieldset"
      aria-describedby={error ? `fx-${name}-error` : undefined}
    >
      <legend>{legend}</legend>
      <div className="fx-opts">
        {options.map((o, i) => (
          <label className="fx-opt" key={o}>
            <input
              type="radio"
              id={`fx-${name}-${i}`}
              name={name}
              value={o}
              checked={value === o}
              onChange={() => onChange(o)}
            />
            {o}
          </label>
        ))}
      </div>
      {error && (
        <p className="fx-error" id={`fx-${name}-error`}>
          {error}
        </p>
      )}
    </fieldset>
  );
}

export default function RequestPage({ focusOnMount = false }: { focusOnMount?: boolean }) {
  const [form, setForm] = useState<RequestForm>(emptyRequest);
  const [errors, setErrors] = useState<RequestErrors>({});
  const [held, setHeld] = useState<RequestForm | null>(null);
  const [interest, setInterest] = useState<PlanId | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const set = <K extends keyof RequestForm>(k: K, v: RequestForm[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    // A changed answer means the held preview no longer matches.
    setHeld(null);
  };
  const recommended = recommendPlan(form.help);
  const contacting =
    form.contactMethod === "Email" || form.contactMethod === "Phone";
  const progress = [
    ["1. Goal and stage", !!form.goal && !!form.stage && !!form.timeline],
    ["2. How you want help", !!form.help],
    ["3. Contact", !!form.contactMethod],
    ["4. Choose a plan", !!held],
  ] as const;
  const currentStep = progress.findIndex(([, done]) => !done);

  function submit(e: FormEvent) {
    e.preventDefault();
    const found = validateRequest(form);
    setErrors(found);
    if (Object.keys(found).length) {
      setHeld(null);
      setTimeout(() => summaryRef.current?.focus(), 0);
      return;
    }
    // Deliberately no network call and no storage: there is no request
    // endpoint yet, and asking for advice must never create an account.
    setHeld({ ...form });
    setTimeout(() => resultRef.current?.focus(), 0);
  }
  const errorList = fieldOrder.filter((k) => errors[k]);

  return (
    <FunnelLayout current="request" focusOnMount={focusOnMount}>
      <section className="fx-panel fx-light" aria-labelledby="fx-req-h">
        <div className="fx-wrap">
          <p className="fx-etched">Step into a full plan</p>
          <h1 id="fx-req-h" className="fx-h2">
            Tell us what you need
          </h1>
          <p className="fx-sub">
            A few quick questions. Asking for advice never signs you up for
            anything, and nothing here is charged.
          </p>
          <ol className="fx-steps" aria-label="Request progress">
            {progress.map(([label, done], i) => (
              <li
                key={label}
                aria-current={i === currentStep ? "step" : undefined}
                className={done ? "fx-done" : undefined}
              >
                {label}
                {done ? <span className="fx-sr"> (done)</span> : null}
              </li>
            ))}
          </ol>

          {errorList.length > 0 && (
            <div
              className="fx-error-summary"
              role="alert"
              tabIndex={-1}
              ref={summaryRef}
              aria-labelledby="fx-err-h"
            >
              <h2 id="fx-err-h">Please fix {errorList.length === 1 ? "1 thing" : `${errorList.length} things`}</h2>
              <ul>
                {errorList.map((k) => (
                  <li key={k}>
                    <a
                      href={`#${firstId[k]}`}
                      onClick={(e) => {
                        e.preventDefault();
                        document.getElementById(firstId[k])?.focus();
                      }}
                    >
                      {errors[k]}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <form noValidate onSubmit={submit} aria-describedby="fx-sample-note" className="fx-form">
            <Choices name="goal" legend="What are you planning for?" options={goals} value={form.goal} error={errors.goal} onChange={(v) => set("goal", v)} />
            <Choices name="stage" legend="Where are you today?" options={lifeStages} value={form.stage} error={errors.stage} onChange={(v) => set("stage", v)} />
            <div className="fx-field">
              <label htmlFor="fx-timeline">When do you want this plan to start working for you?</label>
              <select
                id="fx-timeline"
                value={form.timeline}
                aria-invalid={errors.timeline ? true : undefined}
                aria-describedby={errors.timeline ? "fx-timeline-error" : undefined}
                onChange={(e) => set("timeline", e.target.value)}
              >
                <option value="">Choose a timeline</option>
                {timelines.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              {errors.timeline && <p className="fx-error" id="fx-timeline-error">{errors.timeline}</p>}
            </div>
            <Choices name="help" legend="How would you like help?" options={helpOptions} value={form.help} error={errors.help} onChange={(v) => set("help", v)} />
            <Choices name="contactMethod" legend="How should we contact you?" options={contactMethods} value={form.contactMethod} error={errors.contactMethod} onChange={(v) => set("contactMethod", v)} />
            {contacting && (
              <div className="fx-contact">
                <div className="fx-field">
                  <label htmlFor="fx-name">Your name</label>
                  <input id="fx-name" autoComplete="name" value={form.name} aria-invalid={errors.name ? true : undefined} aria-describedby={errors.name ? "fx-name-error" : undefined} onChange={(e) => set("name", e.target.value)} />
                  {errors.name && <p className="fx-error" id="fx-name-error">{errors.name}</p>}
                </div>
                {form.contactMethod === "Email" ? (
                  <div className="fx-field">
                    <label htmlFor="fx-email">Email address</label>
                    <input id="fx-email" type="email" autoComplete="email" value={form.email} aria-invalid={errors.email ? true : undefined} aria-describedby={errors.email ? "fx-email-error" : undefined} onChange={(e) => set("email", e.target.value)} />
                    {errors.email && <p className="fx-error" id="fx-email-error">{errors.email}</p>}
                  </div>
                ) : (
                  <div className="fx-field">
                    <label htmlFor="fx-phone">Phone number</label>
                    <input id="fx-phone" type="tel" autoComplete="tel" value={form.phone} aria-invalid={errors.phone ? true : undefined} aria-describedby={errors.phone ? "fx-phone-error" : undefined} onChange={(e) => set("phone", e.target.value)} />
                    {errors.phone && <p className="fx-error" id="fx-phone-error">{errors.phone}</p>}
                  </div>
                )}
                <div className="fx-check">
                  <input id="fx-consent" type="checkbox" checked={form.consent} aria-invalid={errors.consent ? true : undefined} aria-describedby={errors.consent ? "fx-consent-error" : undefined} onChange={(e) => set("consent", e.target.checked)} />
                  <label htmlFor="fx-consent">You may contact me about this request only. This does not create an account or sign me up.</label>
                  {errors.consent && <p className="fx-error" id="fx-consent-error">{errors.consent}</p>}
                </div>
              </div>
            )}
            <p className="fx-note" id="fx-sample-note">
              Preview only: your answers stay on this page and aren't saved or
              sent anywhere yet.
            </p>
            <button type="submit" className="fx-btn fx-btn-dark">
              Review my request
            </button>
          </form>

          {held && (
            <div className="fx-held" tabIndex={-1} ref={resultRef} role="status" aria-labelledby="fx-held-h">
              <h2 id="fx-held-h">Request ready — not sent yet</h2>
              <p>
                This is a preview, so your request was <strong>not sent</strong>{" "}
                to anyone and no account was created. Nothing was saved.
              </p>
              <dl>
                <dt>Planning for</dt><dd>{held.goal}</dd>
                <dt>Stage</dt><dd>{held.stage}</dd>
                <dt>Timeline</dt><dd>{held.timeline}</dd>
                <dt>Help</dt><dd>{held.help}</dd>
                <dt>Contact</dt><dd>{held.contactMethod}</dd>
              </dl>
            </div>
          )}
        </div>
      </section>

      <section className="fx-panel fx-dark" aria-labelledby="fx-plans-h">
        <div className="fx-wrap">
          <p className="fx-etched">Plans</p>
          <h2 id="fx-plans-h">Choose how far to go</h2>
          <p className="fx-sub">
            {recommended
              ? `Based on your answers, ${plans.find((p) => p.id === recommended)!.name} looks like the closest fit. Every option stays open to you.`
              : "Answer “How would you like help?” and we'll point out the closest fit. Every option stays open to you."}
          </p>
          <div className="fx-plans">
            {plans.map((p) => (
              <article
                key={p.id}
                className={`fx-chip fx-plan${recommended === p.id ? " fx-rec" : ""}`}
                aria-labelledby={`fx-plan-${p.id}`}
              >
                <div className="fx-face">
                  <div className="fx-top">
                    <span className="fx-etched">{p.code}</span>
                    {recommended === p.id && <span className="fx-tag">Suggested for you</span>}
                  </div>
                  <h3 id={`fx-plan-${p.id}`}>{p.name}</h3>
                  <p className="fx-value fx-price">Price to be set</p>
                  <p className="fx-mean">{p.fits}</p>
                  <ul>
                    {p.includes.map((x) => (
                      <li key={x.label}>
                        {x.label}
                        {!x.built && (
                          <>
                            {" "}
                            <span className="fx-tag">Not built yet</span>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                  {p.note && <p className="fx-hint">{p.note}</p>}
                  {p.id === "free" ? (
                    <a className="fx-btn fx-btn-quiet" href="#/start">
                      Start the free plan check
                    </a>
                  ) : (
                    <button
                      type="button"
                      className="fx-btn fx-btn-quiet"
                      aria-pressed={interest === p.id}
                      onClick={() => setInterest(interest === p.id ? null : p.id)}
                    >
                      {interest === p.id ? `Interested in ${p.name} (noted)` : `I'm interested in ${p.name}`}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
          <p className="fx-sr" role="status" aria-live="polite">
            {interest
              ? `Interest in ${plans.find((p) => p.id === interest)!.name} noted on this page only. No checkout and no charge.`
              : ""}
          </p>
          <p className="fx-note fx-note-dark">
            Prices, trial terms and cancellation rules will be shown here in
            full before any checkout. There is no checkout yet: paid plans
            need a payment provider connected first.
          </p>
        </div>
      </section>
    </FunnelLayout>
  );
}
