export interface JobTemplate {
  id: string;
  titleKey: string;
  title: string;
  descriptionHtml: string;
  descriptionIgboHtml: string;
  requirements: string;
  employmentType: "full_time" | "part_time" | "contract" | "internship";
}

export const JOB_TEMPLATES: JobTemplate[] = [
  {
    id: "software-engineer",
    titleKey: "Portal.templates.softwareEngineer",
    title: "Software Engineer",
    employmentType: "full_time",
    descriptionHtml: `<p><strong>About Our Company</strong></p>
<p>[Describe your company and its connection to the Igbo community or diaspora]</p>
<p><strong>Role Overview</strong></p>
<p>We are looking for a talented Software Engineer to join our growing team. In this role, you will design, develop, and maintain high-quality software solutions that directly impact our users.</p>
<p><strong>Key Responsibilities</strong></p>
<ul>
  <li>Design, develop, and maintain scalable software systems</li>
  <li>Collaborate with cross-functional teams to define and deliver new features</li>
  <li>Write clean, well-tested, and documented code</li>
  <li>Participate in code reviews and contribute to engineering best practices</li>
  <li>Troubleshoot and resolve technical issues in production</li>
</ul>`,
    descriptionIgboHtml: `<p><strong>Banyere Ụlọ Ọrụ Anyị</strong></p>
<p>[Kọọ ihe gbasara ụlọ ọrụ gị na njikọ ya na obodo Igbo ma ọ bụ ndị Igbo bi n'ebe ọzọ]</p>
<p><strong>Nkọwa Ọrụ</strong></p>
<p>Anyị na-achọ Injinia Sọftụwia nwere nkà ka ọ banye na ndị otu anyị na-eto eto. N'ọrụ a, ị ga-emepụta ma na-elekọta ngwanrọ sọftụwia dị elu.</p>`,
    requirements: `<p><strong>Required Skills & Experience</strong></p>
<ul>
  <li>3+ years of professional software development experience</li>
  <li>Proficiency in one or more programming languages (e.g., TypeScript, Python, Go, Java)</li>
  <li>Experience with modern web frameworks and RESTful API design</li>
  <li>Strong understanding of data structures, algorithms, and system design</li>
  <li>Experience with version control (Git) and CI/CD pipelines</li>
  <li>Excellent problem-solving skills and attention to detail</li>
</ul>
<p><strong>Nice to Have</strong></p>
<ul>
  <li>Experience with cloud platforms (AWS, GCP, Azure)</li>
  <li>Familiarity with agile/scrum methodologies</li>
  <li>Open source contributions</li>
</ul>`,
  },
  {
    id: "marketing-manager",
    titleKey: "Portal.templates.marketingManager",
    title: "Marketing Manager",
    employmentType: "full_time",
    descriptionHtml: `<p><strong>About Our Company</strong></p>
<p>[Describe your company and its connection to the Igbo community or diaspora]</p>
<p><strong>Role Overview</strong></p>
<p>We are seeking an experienced Marketing Manager to lead our marketing efforts and drive brand awareness. You will develop and execute marketing strategies that connect with our target audience.</p>
<p><strong>Key Responsibilities</strong></p>
<ul>
  <li>Develop and execute integrated marketing campaigns across digital and traditional channels</li>
  <li>Manage social media presence and content calendar</li>
  <li>Analyze campaign performance and optimize for ROI</li>
  <li>Collaborate with product and sales teams to align messaging</li>
  <li>Manage marketing budget and vendor relationships</li>
  <li>Lead and mentor junior marketing team members</li>
</ul>`,
    descriptionIgboHtml: `<p><strong>Banyere Ụlọ Ọrụ Anyị</strong></p>
<p>[Kọọ ihe gbasara ụlọ ọrụ gị na njikọ ya na obodo Igbo ma ọ bụ ndị Igbo bi n'ebe ọzọ]</p>
<p><strong>Nkọwa Ọrụ</strong></p>
<p>Anyị na-achọ Onye Njikwa Azụmahịa nwere ahụmahụ ka ọ duzie mbọ azụmahịa anyị.</p>`,
    requirements: `<p><strong>Required Skills & Experience</strong></p>
<ul>
  <li>5+ years of marketing experience, with at least 2 years in a management role</li>
  <li>Proven track record of developing and executing successful marketing campaigns</li>
  <li>Strong knowledge of digital marketing channels (SEO, SEM, social media, email)</li>
  <li>Experience with marketing analytics tools (Google Analytics, HubSpot, or similar)</li>
  <li>Excellent written and verbal communication skills</li>
  <li>Bachelor's degree in Marketing, Business, or related field</li>
</ul>
<p><strong>Nice to Have</strong></p>
<ul>
  <li>Experience marketing to African diaspora communities</li>
  <li>Proficiency in Igbo language (spoken or written)</li>
  <li>Experience with influencer marketing or community-led growth</li>
</ul>`,
  },
  {
    id: "sales-representative",
    titleKey: "Portal.templates.salesRepresentative",
    title: "Sales Representative",
    employmentType: "full_time",
    descriptionHtml: `<p><strong>About Our Company</strong></p>
<p>[Describe your company and its connection to the Igbo community or diaspora]</p>
<p><strong>Role Overview</strong></p>
<p>We are looking for a results-driven Sales Representative to grow our customer base. You will identify opportunities, build relationships with prospects, and close deals that drive company revenue.</p>
<p><strong>Key Responsibilities</strong></p>
<ul>
  <li>Prospect and qualify new sales leads through cold outreach, networking, and referrals</li>
  <li>Conduct product demonstrations and presentations for potential clients</li>
  <li>Negotiate contracts and close deals to meet or exceed sales targets</li>
  <li>Maintain accurate records in CRM and provide regular sales forecasts</li>
  <li>Build and maintain long-term relationships with clients</li>
  <li>Gather and relay customer feedback to product and leadership teams</li>
</ul>`,
    descriptionIgboHtml: `<p><strong>Banyere Ụlọ Ọrụ Anyị</strong></p>
<p>[Kọọ ihe gbasara ụlọ ọrụ gị na njikọ ya na obodo Igbo ma ọ bụ ndị Igbo bi n'ebe ọzọ]</p>
<p><strong>Nkọwa Ọrụ</strong></p>
<p>Anyị na-achọ Onye Nrere Ahịa nwere mkpebi ịkwanyere ụlọ ọrụ anyị ụbara.</p>`,
    requirements: `<p><strong>Required Skills & Experience</strong></p>
<ul>
  <li>2+ years of B2B or B2C sales experience</li>
  <li>Proven track record of meeting or exceeding sales quotas</li>
  <li>Strong communication, negotiation, and presentation skills</li>
  <li>Experience with CRM software (Salesforce, HubSpot, or similar)</li>
  <li>Self-motivated with a competitive drive</li>
</ul>
<p><strong>Nice to Have</strong></p>
<ul>
  <li>Experience selling into African markets or diaspora-focused businesses</li>
  <li>Proficiency in Igbo or other Nigerian languages</li>
  <li>Network within the Igbo business community</li>
</ul>`,
  },
  {
    id: "customer-support",
    titleKey: "Portal.templates.customerSupport",
    title: "Customer Support Specialist",
    employmentType: "full_time",
    descriptionHtml: `<p><strong>About Our Company</strong></p>
<p>[Describe your company and its connection to the Igbo community or diaspora]</p>
<p><strong>Role Overview</strong></p>
<p>We are seeking a Customer Support Specialist who is passionate about helping customers succeed. You will be the first point of contact for our customers, resolving issues and ensuring an exceptional experience.</p>
<p><strong>Key Responsibilities</strong></p>
<ul>
  <li>Respond to customer inquiries via email, chat, and phone in a timely and professional manner</li>
  <li>Diagnose and resolve customer issues, escalating complex problems when necessary</li>
  <li>Document customer interactions and maintain accurate records in our support system</li>
  <li>Identify recurring issues and report them to the product team</li>
  <li>Contribute to knowledge base articles and support documentation</li>
  <li>Meet or exceed customer satisfaction (CSAT) and response time targets</li>
</ul>`,
    descriptionIgboHtml: `<p><strong>Banyere Ụlọ Ọrụ Anyị</strong></p>
<p>[Kọọ ihe gbasara ụlọ ọrụ gị na njikọ ya na obodo Igbo ma ọ bụ ndị Igbo bi n'ebe ọzọ]</p>
<p><strong>Nkọwa Ọrụ</strong></p>
<p>Anyị na-achọ Onye Enyemaka Ndị Ahịa nwere ọchịchọ inyere ndị ahịa aka ịgbasa.</p>`,
    requirements: `<p><strong>Required Skills & Experience</strong></p>
<ul>
  <li>1+ year of customer service or support experience</li>
  <li>Excellent verbal and written communication skills in English</li>
  <li>Strong problem-solving ability and patience under pressure</li>
  <li>Familiarity with helpdesk or ticketing tools (Zendesk, Freshdesk, or similar)</li>
  <li>Empathetic and customer-first mindset</li>
</ul>
<p><strong>Nice to Have</strong></p>
<ul>
  <li>Proficiency in Igbo language — a major advantage for serving our community users</li>
  <li>Experience supporting diaspora or multicultural communities</li>
  <li>Technical aptitude or experience with SaaS products</li>
</ul>`,
  },
  {
    id: "administrative-assistant",
    titleKey: "Portal.templates.administrativeAssistant",
    title: "Administrative Assistant",
    employmentType: "full_time",
    descriptionHtml: `<p><strong>About Our Company</strong></p>
<p>[Describe your company and its connection to the Igbo community or diaspora]</p>
<p><strong>Role Overview</strong></p>
<p>We are looking for a detail-oriented Administrative Assistant to support our team's day-to-day operations. You will play a key role in keeping our office running smoothly and efficiently.</p>
<p><strong>Key Responsibilities</strong></p>
<ul>
  <li>Manage calendars, schedule meetings, and coordinate travel arrangements</li>
  <li>Handle correspondence, emails, and phone calls on behalf of the team</li>
  <li>Prepare reports, presentations, and meeting materials</li>
  <li>Maintain filing systems and manage office supplies inventory</li>
  <li>Coordinate with vendors and service providers</li>
  <li>Support onboarding of new staff and manage administrative processes</li>
</ul>`,
    descriptionIgboHtml: `<p><strong>Banyere Ụlọ Ọrụ Anyị</strong></p>
<p>[Kọọ ihe gbasara ụlọ ọrụ gị na njikọ ya na obodo Igbo ma ọ bụ ndị Igbo bi n'ebe ọzọ]</p>
<p><strong>Nkọwa Ọrụ</strong></p>
<p>Anyị na-achọ Onye Enyemaka Njikwa nwere nlezianya iji kwado ọrụ ndị otu anyị kwa ụbọchị.</p>`,
    requirements: `<p><strong>Required Skills & Experience</strong></p>
<ul>
  <li>2+ years of administrative or office management experience</li>
  <li>Proficiency in Microsoft Office Suite (Word, Excel, PowerPoint) or Google Workspace</li>
  <li>Excellent organisational and time-management skills</li>
  <li>Strong written and verbal communication skills</li>
  <li>Ability to handle confidential information with discretion</li>
  <li>Proactive attitude and ability to work independently</li>
</ul>
<p><strong>Nice to Have</strong></p>
<ul>
  <li>Proficiency in Igbo language</li>
  <li>Experience working in a multicultural or diaspora-focused organisation</li>
  <li>Familiarity with project management tools (Notion, Asana, or similar)</li>
</ul>`,
  },
];
