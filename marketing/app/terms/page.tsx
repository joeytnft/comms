import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'GatherSafe Terms of Service. Read the terms governing your use of the GatherSafe secure communication platform for church security teams.',
  alternates: {
    canonical: 'https://gathersafeapp.com/terms',
  },
  openGraph: {
    title: 'Terms of Service | GatherSafe',
    description: 'Terms of Service for the GatherSafe secure communication platform.',
    url: 'https://gathersafeapp.com/terms',
    type: 'website',
  },
  robots: { index: true, follow: true },
};

const EFFECTIVE_DATE = 'April 20, 2026';

export default function TermsPage() {
  return (
    <main className="pt-24 pb-24">
      <div className="mx-auto max-w-3xl px-6">
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Terms of Service
        </h1>
        <p className="mt-3 text-sm text-slate-500">Effective date: {EFFECTIVE_DATE}</p>

        <div className="mt-10 space-y-10 text-slate-300">

          {/* 1 */}
          <section>
            <h2 className="text-lg font-semibold text-white">1. Acceptance of Terms</h2>
            <p className="mt-3 text-sm leading-7">
              By downloading, installing, or using the GatherSafe mobile application or any related
              services (collectively, the &ldquo;Service&rdquo;), you agree to be bound by these
              Terms of Service (&ldquo;Terms&rdquo;). If you are accepting on behalf of an
              organization, you represent that you have authority to bind that organization. If you
              do not agree to these Terms, do not use the Service.
            </p>
          </section>

          {/* 2 */}
          <section>
            <h2 className="text-lg font-semibold text-white">2. Description of Service</h2>
            <p className="mt-3 text-sm leading-7">
              GatherSafe provides an encrypted, real-time communication platform designed for
              faith-based and church security teams. Features include end-to-end encrypted messaging,
              push-to-talk (PTT) voice communication, panic alerts, real-time location sharing, and
              incident logging. GatherSafe is operated by GatherSafe LLC
              (&ldquo;Company,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;).
            </p>
          </section>

          {/* 3 */}
          <section>
            <h2 className="text-lg font-semibold text-white">3. Eligibility</h2>
            <p className="mt-3 text-sm leading-7">
              You must be at least 18 years old and capable of forming a binding contract to use the
              Service. The Service is intended for use by authorized members of security or safety
              teams within religious organizations, churches, or faith-based institutions. You are
              responsible for ensuring that your team members meet these eligibility requirements.
            </p>
          </section>

          {/* 4 */}
          <section>
            <h2 className="text-lg font-semibold text-white">4. Accounts and Organizations</h2>
            <div className="mt-3 space-y-3 text-sm leading-7">
              <p>
                <span className="font-medium text-slate-200">Account creation.</span> You must
                register for an account to use the Service. You agree to provide accurate, current,
                and complete information and to keep it updated.
              </p>
              <p>
                <span className="font-medium text-slate-200">Organization administrators.</span> One
                or more users may be designated as administrators for an organization account.
                Administrators are responsible for managing members, groups, and permissions within
                their organization. The organization is liable for all activity that occurs under its
                account.
              </p>
              <p>
                <span className="font-medium text-slate-200">Account security.</span> You are
                responsible for maintaining the confidentiality of your credentials and for all
                activity under your account. Notify us immediately at{' '}
                <a
                  href="mailto:hello@gathersafeapp.com"
                  className="text-blue-400 underline-offset-2 hover:underline"
                >
                  hello@gathersafeapp.com
                </a>{' '}
                if you suspect unauthorized access.
              </p>
            </div>
          </section>

          {/* 5 */}
          <section>
            <h2 className="text-lg font-semibold text-white">5. Subscriptions and Payments</h2>
            <div className="mt-3 space-y-3 text-sm leading-7">
              <p>
                <span className="font-medium text-slate-200">Plans.</span> GatherSafe offers free
                and paid subscription plans. Paid features are accessible upon purchase of the
                applicable plan. Plan details and pricing are described on our{' '}
                <a
                  href="/pricing"
                  className="text-blue-400 underline-offset-2 hover:underline"
                >
                  Pricing page
                </a>
                .
              </p>
              <p>
                <span className="font-medium text-slate-200">Billing.</span> Subscriptions are
                billed on a recurring basis (monthly or annually) through Apple App Store or Google
                Play. All transactions are processed by the respective platform and are subject to
                their payment terms.
              </p>
              <p>
                <span className="font-medium text-slate-200">Free trial.</span> Where a free trial
                is offered, it begins on the date you activate the trial. At the end of the trial
                period, your subscription will automatically convert to a paid plan unless you cancel
                before the trial ends.
              </p>
              <p>
                <span className="font-medium text-slate-200">Cancellation and refunds.</span>{' '}
                Subscriptions may be cancelled at any time through your device&rsquo;s app store
                account settings. Cancellation takes effect at the end of the current billing period.
                Refunds are subject to the refund policy of Apple App Store or Google Play.
              </p>
              <p>
                <span className="font-medium text-slate-200">Price changes.</span> We may change
                subscription prices with at least 30 days&rsquo; notice. Continued use after the
                price change takes effect constitutes acceptance of the new price.
              </p>
            </div>
          </section>

          {/* 6 */}
          <section>
            <h2 className="text-lg font-semibold text-white">6. Acceptable Use</h2>
            <p className="mt-3 text-sm leading-7">
              You agree to use the Service only for lawful purposes and in accordance with these
              Terms. You must not:
            </p>
            <ul className="mt-3 space-y-2 text-sm leading-7 list-disc list-inside text-slate-400">
              <li>Use the Service to transmit unlawful, harassing, defamatory, or abusive content.</li>
              <li>Impersonate any person or entity or misrepresent your affiliation.</li>
              <li>Attempt to gain unauthorized access to any part of the Service or another user&rsquo;s account.</li>
              <li>Reverse-engineer, decompile, or disassemble any part of the Service.</li>
              <li>Use the Service in any way that could disable, overburden, or impair our infrastructure.</li>
              <li>Use the Service to coordinate or facilitate any illegal activity.</li>
              <li>Resell, sublicense, or otherwise commercialize access to the Service without our written consent.</li>
            </ul>
            <p className="mt-4 text-sm leading-7">
              We reserve the right to suspend or terminate accounts that violate these rules.
            </p>
          </section>

          {/* 7 */}
          <section>
            <h2 className="text-lg font-semibold text-white">7. Encryption and Data Security</h2>
            <div className="mt-3 space-y-3 text-sm leading-7">
              <p>
                GatherSafe uses end-to-end encryption for text messages and encrypted voice
                transmission for PTT audio. Encryption keys are generated and stored on your device.
                Our servers route encrypted data but do not have access to the plaintext content of
                your messages or voice communications.
              </p>
              <p>
                While we implement industry-standard security measures, no system is completely
                secure. You acknowledge that GatherSafe cannot guarantee the absolute security of
                data transmitted over the internet or stored on your device. You are responsible for
                maintaining the security of the devices used to access the Service.
              </p>
            </div>
          </section>

          {/* 8 */}
          <section>
            <h2 className="text-lg font-semibold text-white">8. Location Services and Alerts</h2>
            <p className="mt-3 text-sm leading-7">
              Certain features — including real-time location sharing, geofencing, and panic alerts —
              require access to your device&rsquo;s location. Location sharing is opt-in and
              controlled by organization administrators and individual users. Panic alerts broadcast
              your location to your security team. You consent to this data being shared with members
              of your organization when you activate these features. We do not sell or share location
              data with third parties beyond what is necessary to operate the Service.
            </p>
          </section>

          {/* 9 */}
          <section>
            <h2 className="text-lg font-semibold text-white">9. Intellectual Property</h2>
            <p className="mt-3 text-sm leading-7">
              The Service, including all software, design, text, graphics, and other content, is
              owned by GatherSafe LLC and is protected by applicable intellectual property laws. These
              Terms do not grant you any right, title, or interest in the Service beyond the limited
              license to use it as permitted herein. You retain ownership of content you create
              (such as incident reports), and you grant us a limited license to store and transmit
              that content solely to provide the Service.
            </p>
          </section>

          {/* 10 */}
          <section>
            <h2 className="text-lg font-semibold text-white">10. Third-Party Services</h2>
            <p className="mt-3 text-sm leading-7">
              The Service integrates with third-party services including Apple App Store, Google
              Play, Firebase Cloud Messaging, and Planning Center (where enabled). Your use of those
              services is governed by their respective terms and privacy policies. We are not
              responsible for the practices of third-party services.
            </p>
          </section>

          {/* 11 */}
          <section>
            <h2 className="text-lg font-semibold text-white">11. Disclaimer of Warranties</h2>
            <p className="mt-3 text-sm leading-7 uppercase text-slate-400">
              The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without
              warranties of any kind, express or implied, including but not limited to warranties of
              merchantability, fitness for a particular purpose, or non-infringement. We do not
              warrant that the Service will be uninterrupted, error-free, or free of viruses or
              other harmful components.
            </p>
            <p className="mt-3 text-sm leading-7 font-medium text-slate-200">
              GatherSafe is a communication tool. It is not a substitute for trained security
              personnel, professional law enforcement, or emergency services. In any emergency, always
              contact 911 or your local emergency number first.
            </p>
          </section>

          {/* 12 */}
          <section>
            <h2 className="text-lg font-semibold text-white">12. Limitation of Liability</h2>
            <p className="mt-3 text-sm leading-7 text-slate-400">
              To the fullest extent permitted by law, GatherSafe LLC and its officers, directors,
              employees, and agents shall not be liable for any indirect, incidental, special,
              consequential, or punitive damages, or any loss of profits or revenues, whether
              incurred directly or indirectly, or any loss of data, use, goodwill, or other
              intangible losses, arising out of or related to your use of or inability to use the
              Service. Our total cumulative liability to you for any claims arising under these Terms
              shall not exceed the greater of (a) the amount you paid to us in the twelve months
              preceding the claim or (b) $100 USD.
            </p>
          </section>

          {/* 13 */}
          <section>
            <h2 className="text-lg font-semibold text-white">13. Indemnification</h2>
            <p className="mt-3 text-sm leading-7">
              You agree to indemnify and hold harmless GatherSafe LLC and its affiliates, officers,
              directors, employees, and agents from and against any claims, liabilities, damages,
              losses, and expenses (including reasonable legal fees) arising out of or related to
              your use of the Service, your violation of these Terms, or your violation of any
              third-party rights.
            </p>
          </section>

          {/* 14 */}
          <section>
            <h2 className="text-lg font-semibold text-white">14. Termination</h2>
            <p className="mt-3 text-sm leading-7">
              We may suspend or terminate your access to the Service at any time, with or without
              cause or notice, including for violation of these Terms. You may terminate your account
              at any time by contacting us or cancelling your subscription through your app store
              settings. Upon termination, your right to use the Service ceases immediately. Sections
              that by their nature should survive termination will survive, including sections on
              intellectual property, disclaimers, limitation of liability, and governing law.
            </p>
          </section>

          {/* 15 */}
          <section>
            <h2 className="text-lg font-semibold text-white">15. Governing Law and Disputes</h2>
            <p className="mt-3 text-sm leading-7">
              These Terms are governed by the laws of the State of Texas, without regard to its
              conflict-of-law provisions. Any dispute arising out of or relating to these Terms or
              the Service shall be resolved by binding arbitration administered in accordance with
              the American Arbitration Association&rsquo;s Consumer Arbitration Rules. You and
              GatherSafe LLC each waive any right to a jury trial or to participate in a class
              action lawsuit or class-wide arbitration.
            </p>
          </section>

          {/* 16 */}
          <section>
            <h2 className="text-lg font-semibold text-white">16. Changes to These Terms</h2>
            <p className="mt-3 text-sm leading-7">
              We may update these Terms from time to time. When we make material changes, we will
              notify you via the app or by email at least 14 days before the changes take effect.
              Your continued use of the Service after the effective date constitutes acceptance of
              the revised Terms. If you do not agree to the changes, you must stop using the Service
              before they take effect.
            </p>
          </section>

          {/* 17 */}
          <section>
            <h2 className="text-lg font-semibold text-white">17. Contact</h2>
            <p className="mt-3 text-sm leading-7">
              If you have questions about these Terms, please contact us at:
            </p>
            <address className="mt-3 not-italic text-sm leading-7 text-slate-400">
              GatherSafe LLC
              <br />
              <a
                href="mailto:hello@gathersafeapp.com"
                className="text-blue-400 underline-offset-2 hover:underline"
              >
                hello@gathersafeapp.com
              </a>
            </address>
          </section>

        </div>
      </div>
    </main>
  );
}
