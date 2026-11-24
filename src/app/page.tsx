import { ButtonLink, Disclaimer } from "@/components/ui/primitives";
import { AlertIcon, ArrowRightIcon, BuildingIcon, CoinsIcon, CompareIcon, DocumentIcon, LinkIcon, LockIcon, SearchIcon, ShieldIcon, UsersIcon, WalletIcon } from "@/components/ui/icons";
import { RiskBadge } from "@/components/ui/risk";

const FEATURES = [
  { Icon: SearchIcon, title: "AI-powered ad scanner", body: "Paste a job or internship ad. Claude and our rule engine look for fee requests, fake guarantees, pressure tactics and more." },
  { Icon: DocumentIcon, title: "Evidence, not guesses", body: "Every warning quotes the exact words it's based on, highlighted in the ad, with a confidence level and what to do next." },
  { Icon: WalletIcon, title: "Payment scam detector", body: "Spot registration fees, security deposits, training charges and 'refundable' payments — and understand why they're risky." },
  { Icon: CoinsIcon, title: "Salary reality check", body: "Flags 'earn ₹25,000 a week' style promises. Compares with cited benchmarks when available — and says so when it can't." },
  { Icon: LinkIcon, title: "Safe link inspection", body: "See where a job link really goes: redirects, domain, and page content — fetched safely on our server, never in your browser." },
  { Icon: BuildingIcon, title: "Company checks", body: "Compare recruiter email and website domains, check domain age, and see clearly what was verified and what wasn't." },
  { Icon: CompareIcon, title: "Compare opportunities", body: "Put two offers side by side to see which one has more warning signs and missing information." },
  { Icon: UsersIcon, title: "Moderated community reports", body: "Read experiences other job seekers have shared — reviewed against guidelines and never presented as proof." },
];

const STEPS = [
  { n: 1, title: "Paste the ad or link", body: "Copy the job description from WhatsApp, email, a job portal or social media. Add the link if you have one." },
  { n: 2, title: "We screen it", body: "Sensitive numbers are removed, then Claude and our rules analyse the text. Ad content is treated as data — instructions hidden in it are ignored." },
  { n: 3, title: "Read the evidence", body: "Get a transparent warning-sign score, highlighted quotes, missing information, and concrete steps to verify the employer." },
];

const RED_FLAGS = [
  "Registration, training or 'security deposit' fees",
  "Guaranteed selection with no interview",
  "Interviews only over WhatsApp or Telegram chat",
  "Pay far above normal for very little work",
  "Requests for Aadhaar, PAN, bank details or OTPs early on",
  "Recruiters using free email addresses",
];

export default function LandingPage() {
  return (
    <main id="main">
      {/* Hero */}
      <section className="border-b border-line bg-white">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-800">
              <ShieldIcon className="h-4 w-4" /> For students, fresh graduates and job seekers
            </p>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight text-ink sm:text-5xl">
              Don&apos;t get trapped.
              <br />
              <span className="text-brand-600">Verify before you apply.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-ink-soft">
              JobShield AI checks job and internship ads for the warning signs scammers rely on — before you pay a fee or hand over your documents.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/scan" size="lg">
                Scan a job ad <ArrowRightIcon className="h-5 w-5" />
              </ButtonLink>
              <ButtonLink href="/demo" variant="outline" size="lg">
                Quick check without an account
              </ButtonLink>
            </div>
            <p className="mt-4 flex items-center gap-2 text-sm text-muted">
              <LockIcon className="h-4 w-4" /> Your scans are private. Card, ID and bank numbers are removed before analysis.
            </p>
          </div>

          {/* Illustrative example — static sample, clearly labelled */}
          <figure aria-label="Example report (sample)" className="rounded-2xl border border-line bg-canvas p-5 shadow-[var(--shadow-card)]">
            <figcaption className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Example report · fictional sample ad</figcaption>
            <div className="rounded-xl bg-white p-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold">Work-from-home data entry</p>
                <RiskBadge level="critical" />
              </div>
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-soft">
                Earn ₹25,000 per week. 100% job guarantee, no interview required.{" "}
                <mark className="mark-critical rounded px-0.5 text-ink">To confirm your seat, pay a refundable registration fee of ₹1,999 within 24 hours.</mark>{" "}
                Send your Aadhaar and bank details on WhatsApp.
              </p>
              <div className="mt-4 rounded-lg border border-[#f3c3c8] bg-risk-critical-bg p-3 text-sm">
                <p className="flex items-center gap-1.5 font-semibold text-risk-critical">
                  <AlertIcon className="h-4 w-4" /> Asks the candidate to pay a fee
                </p>
                <p className="mt-1 text-ink-soft">Legitimate employers rarely charge candidates to apply, train or join.</p>
              </div>
            </div>
          </figure>
        </div>
      </section>

      {/* Problem */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Fake job offers target people who are eager to start</h2>
            <p className="mt-4 text-ink-soft">
              Recruitment scams copy real company names, promise easy money and push you to act fast. They usually end with a &ldquo;small refundable fee&rdquo;, stolen identity
              documents, or an account emptied with a shared OTP. Students and first-time job seekers are frequent targets.
            </p>
            <p className="mt-4 text-ink-soft">JobShield helps you slow down and check the warning signs — with evidence you can see for yourself.</p>
          </div>
          <div className="rounded-2xl border border-line bg-white p-6">
            <h3 className="font-semibold">Common warning signs</h3>
            <ul className="mt-4 space-y-3">
              {RED_FLAGS.map((f) => (
                <li key={f} className="flex gap-3 text-sm text-ink-soft">
                  <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-risk-high" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-20 border-y border-line bg-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">How it works</h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="rounded-2xl border border-line bg-canvas p-6">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-600 font-bold text-white">{s.n}</span>
                <h3 className="mt-4 font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-ink-soft">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Everything you need to check an offer</h2>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ Icon, title, body }) => (
            <div key={title} className="rounded-2xl border border-line bg-white p-5 shadow-[var(--shadow-card)]">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-xl text-brand-600">
                <Icon />
              </span>
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm text-ink-soft">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Trust + CTA */}
      <section className="mx-auto max-w-7xl px-4 pb-8 sm:px-6">
        <div className="grid gap-6 rounded-3xl bg-brand-800 p-8 text-white md:grid-cols-[1.4fr_1fr] md:p-12">
          <div>
            <h2 className="text-2xl font-bold sm:text-3xl">Honest by design</h2>
            <ul className="mt-5 space-y-2.5 text-[15px] text-brand-100">
              <li>• We never label a company as fraudulent. We show warning signs and the evidence behind them.</li>
              <li>• We never invent company registrations, reviews or website ownership.</li>
              <li>• The score counts warning signs — it is not a probability of fraud.</li>
              <li>• If AI analysis is unavailable, we tell you and show rule-based results instead.</li>
            </ul>
          </div>
          <div className="flex flex-col justify-center gap-3 rounded-2xl bg-white/10 p-6">
            <p className="text-lg font-semibold">Got an offer that feels off?</p>
            <ButtonLink href="/scan" variant="secondary" size="lg">
              Scan it now <ArrowRightIcon className="h-5 w-5" />
            </ButtonLink>
            <Disclaimer className="text-brand-100 [&_strong]:text-white" />
          </div>
        </div>
      </section>
    </main>
  );
}
