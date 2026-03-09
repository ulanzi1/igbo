-- Migration 0048: Seed governance documents (About Us + GDPR Breach Runbook)
INSERT INTO "platform_governance_documents" ("title", "slug", "content", "content_igbo", "version", "status", "visibility", "published_at")
VALUES (
  'About OBIGBO',
  'about-us',
  '<h2>Our Mission</h2>
<p>OBIGBO is a digital home for the global Igbo community. We connect Igbo people worldwide, preserving our rich cultural heritage while building bridges across generations and geographies.</p>
<h2>Our Vision</h2>
<p>A world where every Igbo person, no matter where they are, feels connected to their roots and empowered by their community.</p>
<h2>Cultural Context</h2>
<p>The Igbo people are one of the largest ethnic groups in Africa, with a vibrant diaspora spanning every continent. OBIGBO brings us together in a space that celebrates our language, traditions, and shared values of community, enterprise, and resilience.</p>
<h2>Our Story</h2>
<p>OBIGBO was born from a simple observation: while Igbo people thrive individually across the globe, we lack a dedicated digital space to connect, share, and grow together as a community. This platform is our answer to that need.</p>',
  '<h2>Ebumnobi anyị</h2>
<p>OBIGBO bụ ụlọ dijitalụ maka ọha Igbo n''ụwa nile. Anyị na-ejikọta ndị Igbo n''ụwa nile, na-echebe ihe nketa omenala anyị dị ịma aka n''oge anyị na-ewu ihe nkwado n''oge gara aga na ebe dị iche iche.</p>
<h2>Echiche anyị</h2>
<p>Ụwa nke onye Igbo ọ bụla, n''ebe ọ bụla ọ nọ, nọ njikọ na mgbọrọgwụ ya ma nwee ike site n''obodo ya.</p>
<h2>Ọnọdụ Omenala</h2>
<p>Ndị Igbo bụ otu n''ime ìgwè ụyọkọ ndị obi ukwuu n''Afrịka, nwee ndị diaspora dị mma gbasara kontinent ọ bụla. OBIGBO na-akpakọta anyị na ebe na-asọpụrụ asụsụ anyị, omenala, na uru anyị nkpa n''obodo, azụmahịa, na ọnọdụ.</p>
<h2>Akụkọ anyị</h2>
<p>OBIGBO pụtara site n''ihe ọchọchọ dị mfe: n''oge ndị Igbo na-eto eto n''onwe ha n''ụwa nile, anyị enweghị ebe dijitalụ nke anyị iji jikọọ, kesaa, ma too ọnụ dị ka obodo. Ọlọlọ a bụ nzaghachi anyị n''mkpa ahụ.</p>',
  1,
  'published',
  'public',
  now()
);

INSERT INTO "platform_governance_documents" ("title", "slug", "content", "content_igbo", "version", "status", "visibility", "published_at")
VALUES (
  'GDPR Data Breach Response Runbook',
  'gdpr-breach-runbook',
  '<h2>Overview</h2>
<p>GDPR Article 33 requires notification of the supervisory authority within <strong>72 hours</strong> of becoming aware of a personal data breach. Article 34 may additionally require notifying affected individuals.</p>
<h2>Step-by-Step Procedure</h2>
<h3>1. Detect the Breach</h3>
<ul><li>Identify the nature of the breach (unauthorised access, accidental disclosure, data loss, etc.)</li><li>Note the exact date/time the breach was discovered</li><li>Start the 72-hour notification clock from this moment</li></ul>
<h3>2. Log the Incident</h3>
<ul><li>Navigate to /admin/breach-response</li><li>Set the Incident Timestamp to when the breach occurred (or was discovered)</li><li>Generate the affected member list using the date range during which the breach window falls</li></ul>
<h3>3. Generate Affected Member List</h3>
<ul><li>Use the "Generate Affected Member List" tool at /admin/breach-response</li><li>Set since = start of breach window (ISO 8601)</li><li>Set until = end of breach window</li><li>Review the list — confirm member count and scope</li></ul>
<h3>4. Send Bulk Notifications</h3>
<p>Compose the notification message explaining what data was exposed, when the breach occurred, what data was affected, steps members can take to protect themselves, and contact information for questions.</p>
<h3>5. Notify the Supervisory Authority</h3>
<p>File a report with the relevant Data Protection Authority within 72 hours. Reference the incident timestamp logged in Step 2.</p>
<h3>6. Document the Incident</h3>
<p>Record the full incident in the governance log. Include: detection date, scope, notification date, regulatory filing reference.</p>
<h2>Retention Cleanup Job</h2>
<p>The daily anonymization job runs at 2:00 AM (server time). This job queries auth_users for accounts with account_status = ''PENDING_DELETION'' and scheduled_deletion_at &lt;= NOW(), anonymizes each account, and logs each anonymization to the audit trail.</p>
<h2>Data Export Feature Flag</h2>
<p>INCLUDE_RECEIVED_MESSAGES_IN_EXPORT=false — Legal review required before enabling. The default false excludes received messages from GDPR data exports (Article 20). Legal review status: Pending.</p>',
  NULL,
  1,
  'published',
  'admin_only',
  now()
);
