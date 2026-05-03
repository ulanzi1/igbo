/**
 * Seed 1000 realistic Igbo community users (community + portal)
 *
 * Creates users with complete community profiles and portal profiles:
 * - 500 in Nigeria, 250 in rest of Africa, 250 worldwide
 * - 990 JOB_SEEKER (seeker profiles + preferences + onboarding complete)
 * - 10 EMPLOYER (company profiles + onboarding complete)
 * - All emails: {firstname}.{lastname}.{NNN}@igbo.global
 * - Password: inGuide007 (bcrypt 12 rounds)
 *
 * Usage:
 *   DATABASE_URL="postgres://..." pnpm tsx scripts/seed-igbo-users.ts
 *
 * Cleanup:
 *   DELETE FROM auth_users WHERE email LIKE '%@igbo.global';
 *   -- CASCADE handles community_profiles, auth_user_roles, portal_seeker_profiles, etc.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import { eq, sql } from "drizzle-orm";
import postgres from "postgres";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

import { authUsers } from "@igbo/db/schema/auth-users";
import { communityProfiles } from "@igbo/db/schema/community-profiles";
import { authRoles, authUserRoles } from "@igbo/db/schema/auth-permissions";
import { portalSeekerProfiles } from "@igbo/db/schema/portal-seeker-profiles";
import { portalSeekerPreferences } from "@igbo/db/schema/portal-seeker-preferences";
import { portalCompanyProfiles } from "@igbo/db/schema/portal-company-profiles";
import { communityMemberFollows } from "@igbo/db/schema/community-connections";

// ─────────────────────────────────────────────────────────────────────────────
// DB connection
// ─────────────────────────────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const client = postgres(DATABASE_URL, { max: 10 });
const db = drizzle(client);

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const TOTAL_USERS = 1000;
const EMPLOYER_COUNT = 10;
const SEEKER_COUNT = TOTAL_USERS - EMPLOYER_COUNT;
const BATCH_SIZE = 500;
const PASSWORD = "inGuide007";

// ─────────────────────────────────────────────────────────────────────────────
// Igbo Names
// ─────────────────────────────────────────────────────────────────────────────

const IGBO_FIRST_NAMES_MALE = [
  "Chukwuemeka",
  "Obinna",
  "Ikechukwu",
  "Nnamdi",
  "Chibueze",
  "Chinedu",
  "Uchenna",
  "Emeka",
  "Obi",
  "Kelechi",
  "Nwachukwu",
  "Ugochukwu",
  "Chidi",
  "Ebuka",
  "Ifeanyichukwu",
  "Kenechukwu",
  "Chukwudi",
  "Obiora",
  "Azubuike",
  "Tochukwu",
  "Somadina",
  "Chijioke",
  "Okezie",
  "Nduka",
  "Ekene",
  "Uzochukwu",
  "Chukwuka",
  "Okwudili",
  "Ifeanyi",
  "Uche",
  "Okechukwu",
  "Arinze",
  "Uzoma",
  "Ogbonna",
  "Chukwubuikem",
  "Tobenna",
  "Chinonso",
  "Onyeka",
  "Jidenna",
  "Lotanna",
  "Dubem",
  "Chukwuebuka",
  "Ikenna",
  "Nnanna",
  "Osinachi",
  "Chikezie",
  "Ndubuisi",
  "Obichukwu",
  "Oluomachi",
  "Ikem",
];

const IGBO_FIRST_NAMES_FEMALE = [
  "Chioma",
  "Adaeze",
  "Ngozi",
  "Chiamaka",
  "Nneka",
  "Obiageli",
  "Adanna",
  "Chinyere",
  "Ifeoma",
  "Amaka",
  "Nnenna",
  "Ogechukwu",
  "Chinelo",
  "Chidimma",
  "Nkechi",
  "Adaobi",
  "Onyinyechi",
  "Eberechi",
  "Uchenna",
  "Somtochukwu",
  "Nneoma",
  "Oluchi",
  "Ugochi",
  "Kasiemobi",
  "Chidinma",
  "Akuchinyere",
  "Uzoamaka",
  "Nkemdirim",
  "Chikaodinaka",
  "Ego",
  "Mmesoma",
  "Sopuruchi",
  "Amarachi",
  "Tochi",
  "Ogechukwukama",
  "Kamsiyochukwu",
  "Ogechi",
  "Nneamaka",
  "Adaugo",
  "Ijemma",
  "Obianuju",
  "Munachiso",
  "Chinaza",
  "Udoka",
  "Zimuzo",
  "Nwamaka",
  "Ezinne",
  "Oluchukwu",
  "Oluebube",
  "Chika",
];

const IGBO_SURNAMES = [
  "Okafor",
  "Nwosu",
  "Eze",
  "Obi",
  "Nwankwo",
  "Onyekachi",
  "Okeke",
  "Nwachukwu",
  "Igwe",
  "Agu",
  "Chukwu",
  "Anyanwu",
  "Okonkwo",
  "Uzoma",
  "Ikechukwu",
  "Obinna",
  "Ibe",
  "Emeka",
  "Uche",
  "Nnaji",
  "Ekwueme",
  "Oguike",
  "Nwafor",
  "Chidera",
  "Onwuegbuzie",
  "Akpan",
  "Dimgba",
  "Agbai",
  "Ekeoma",
  "Ndubueze",
  "Ogbonnaya",
  "Ezeji",
  "Ukwu",
  "Mbachu",
  "Akujobi",
  "Iheanacho",
  "Nweke",
  "Umeh",
  "Okoli",
  "Opara",
  "Iwu",
  "Okoro",
  "Nnadi",
  "Odoemena",
  "Madueke",
  "Osuji",
  "Ejiofor",
  "Mbah",
  "Ekezie",
  "Nwoye",
  "Aneke",
  "Onuoha",
  "Ugwu",
  "Amadi",
  "Okwuosa",
  "Achebe",
  "Adichie",
  "Ohaeri",
  "Nwobodo",
  "Enwerem",
];

// ─────────────────────────────────────────────────────────────────────────────
// Locations
// ─────────────────────────────────────────────────────────────────────────────

interface Location {
  city: string;
  state: string;
  country: string;
}

const NIGERIA_LOCATIONS: Location[] = [
  { city: "Lagos", state: "Lagos", country: "Nigeria" },
  { city: "Ikeja", state: "Lagos", country: "Nigeria" },
  { city: "Victoria Island", state: "Lagos", country: "Nigeria" },
  { city: "Abuja", state: "FCT", country: "Nigeria" },
  { city: "Port Harcourt", state: "Rivers", country: "Nigeria" },
  { city: "Owerri", state: "Imo", country: "Nigeria" },
  { city: "Enugu", state: "Enugu", country: "Nigeria" },
  { city: "Nsukka", state: "Enugu", country: "Nigeria" },
  { city: "Onitsha", state: "Anambra", country: "Nigeria" },
  { city: "Awka", state: "Anambra", country: "Nigeria" },
  { city: "Nnewi", state: "Anambra", country: "Nigeria" },
  { city: "Umuahia", state: "Abia", country: "Nigeria" },
  { city: "Aba", state: "Abia", country: "Nigeria" },
  { city: "Abakaliki", state: "Ebonyi", country: "Nigeria" },
  { city: "Asaba", state: "Delta", country: "Nigeria" },
  { city: "Warri", state: "Delta", country: "Nigeria" },
  { city: "Benin City", state: "Edo", country: "Nigeria" },
  { city: "Ibadan", state: "Oyo", country: "Nigeria" },
  { city: "Kano", state: "Kano", country: "Nigeria" },
  { city: "Calabar", state: "Cross River", country: "Nigeria" },
  { city: "Uyo", state: "Akwa Ibom", country: "Nigeria" },
  { city: "Jos", state: "Plateau", country: "Nigeria" },
  { city: "Kaduna", state: "Kaduna", country: "Nigeria" },
  { city: "Lekki", state: "Lagos", country: "Nigeria" },
  { city: "Surulere", state: "Lagos", country: "Nigeria" },
];

const AFRICA_LOCATIONS: Location[] = [
  { city: "Accra", state: "Greater Accra", country: "Ghana" },
  { city: "Kumasi", state: "Ashanti", country: "Ghana" },
  { city: "Johannesburg", state: "Gauteng", country: "South Africa" },
  { city: "Cape Town", state: "Western Cape", country: "South Africa" },
  { city: "Pretoria", state: "Gauteng", country: "South Africa" },
  { city: "Nairobi", state: "Nairobi County", country: "Kenya" },
  { city: "Mombasa", state: "Mombasa County", country: "Kenya" },
  { city: "Douala", state: "Littoral", country: "Cameroon" },
  { city: "Yaounde", state: "Centre", country: "Cameroon" },
  { city: "Dar es Salaam", state: "Dar es Salaam", country: "Tanzania" },
  { city: "Addis Ababa", state: "Addis Ababa", country: "Ethiopia" },
  { city: "Dakar", state: "Dakar", country: "Senegal" },
  { city: "Kigali", state: "Kigali", country: "Rwanda" },
  { city: "Kampala", state: "Central", country: "Uganda" },
  { city: "Abidjan", state: "Lagunes", country: "Ivory Coast" },
];

const WORLD_LOCATIONS: Location[] = [
  { city: "London", state: "England", country: "United Kingdom" },
  { city: "Manchester", state: "England", country: "United Kingdom" },
  { city: "Birmingham", state: "England", country: "United Kingdom" },
  { city: "New York", state: "New York", country: "United States" },
  { city: "Houston", state: "Texas", country: "United States" },
  { city: "Atlanta", state: "Georgia", country: "United States" },
  { city: "Washington DC", state: "District of Columbia", country: "United States" },
  { city: "Chicago", state: "Illinois", country: "United States" },
  { city: "Los Angeles", state: "California", country: "United States" },
  { city: "Toronto", state: "Ontario", country: "Canada" },
  { city: "Calgary", state: "Alberta", country: "Canada" },
  { city: "Berlin", state: "Berlin", country: "Germany" },
  { city: "Frankfurt", state: "Hesse", country: "Germany" },
  { city: "Paris", state: "Ile-de-France", country: "France" },
  { city: "Dublin", state: "Leinster", country: "Ireland" },
  { city: "Amsterdam", state: "North Holland", country: "Netherlands" },
  { city: "Dubai", state: "Dubai", country: "United Arab Emirates" },
  { city: "Sydney", state: "New South Wales", country: "Australia" },
  { city: "Melbourne", state: "Victoria", country: "Australia" },
  { city: "Doha", state: "Doha", country: "Qatar" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Skills, Industries, Job Titles, Bio Templates
// ─────────────────────────────────────────────────────────────────────────────

const SKILLS = [
  "JavaScript",
  "TypeScript",
  "React",
  "Node.js",
  "Python",
  "Java",
  "SQL",
  "PostgreSQL",
  "MongoDB",
  "AWS",
  "Docker",
  "Kubernetes",
  "Git",
  "Agile",
  "Scrum",
  "Project Management",
  "Data Analysis",
  "Machine Learning",
  "UI/UX Design",
  "Figma",
  "Adobe Creative Suite",
  "Marketing",
  "Digital Marketing",
  "SEO",
  "Content Writing",
  "Financial Analysis",
  "Accounting",
  "Auditing",
  "Supply Chain Management",
  "Logistics",
  "Human Resources",
  "Recruitment",
  "Training",
  "Sales",
  "Business Development",
  "Customer Service",
  "Civil Engineering",
  "Electrical Engineering",
  "Mechanical Engineering",
  "Healthcare",
  "Nursing",
  "Pharmacy",
  "Public Health",
  "Teaching",
  "Curriculum Development",
  "Research",
  "Legal",
  "Compliance",
  "Risk Management",
  "Agriculture",
  "Agribusiness",
  "Food Technology",
  "Oil & Gas",
  "Renewable Energy",
  "Environmental Science",
  "Telecommunications",
  "Networking",
  "Cybersecurity",
  "Banking",
  "Insurance",
  "Microfinance",
];

const INDUSTRIES = [
  "Technology",
  "Finance",
  "Healthcare",
  "Education",
  "Oil & Gas",
  "Telecommunications",
  "Agriculture",
  "Manufacturing",
  "Retail",
  "Construction",
  "Transportation",
  "Media",
  "Consulting",
  "Real Estate",
  "Hospitality",
  "Legal Services",
  "NGO",
  "Renewable Energy",
  "Fintech",
  "E-commerce",
];

const JOB_TITLES = [
  "Software Engineer",
  "Senior Developer",
  "Full Stack Developer",
  "Product Manager",
  "Project Manager",
  "Business Analyst",
  "Data Analyst",
  "Data Scientist",
  "DevOps Engineer",
  "UI/UX Designer",
  "Graphic Designer",
  "Marketing Manager",
  "Sales Executive",
  "Account Manager",
  "Financial Analyst",
  "Accountant",
  "HR Manager",
  "Recruitment Specialist",
  "Civil Engineer",
  "Electrical Engineer",
  "Mechanical Engineer",
  "Teacher",
  "Lecturer",
  "Research Associate",
  "Nurse",
  "Pharmacist",
  "Doctor",
  "Lawyer",
  "Legal Advisor",
  "Compliance Officer",
  "Agricultural Officer",
  "Supply Chain Manager",
  "Logistics Coordinator",
  "Banking Officer",
  "Insurance Agent",
  "Consultant",
  "Content Writer",
  "Journalist",
  "Public Relations Officer",
  "Architect",
  "Quantity Surveyor",
  "Site Engineer",
];

const DESIRED_ROLES = [
  "Software Engineer",
  "Backend Developer",
  "Frontend Developer",
  "Full Stack Developer",
  "DevOps Engineer",
  "Data Engineer",
  "Product Manager",
  "Project Manager",
  "Scrum Master",
  "Business Analyst",
  "Data Analyst",
  "UX Designer",
  "Marketing Manager",
  "Sales Manager",
  "Account Executive",
  "Financial Analyst",
  "Accountant",
  "HR Specialist",
  "Teacher",
  "Research Scientist",
  "Consultant",
];

const COMPANY_NAMES = [
  "Igbo Tech Solutions",
  "Nkemdirim Digital",
  "Odinaka Consulting",
  "ChiNexus Corp",
  "Anambra Systems",
  "Enugu Innovations",
  "Niger Bridge Technologies",
  "Obiora Group",
  "Ndi Igbo Ventures",
  "Okafor & Associates",
];

const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-500", "501-1000"];

const BIO_TEMPLATES = [
  "Passionate {profession} with {years}+ years of experience. Proud member of the Igbo community, connecting heritage with modern innovation.",
  "Dedicated {profession} from {state}. Committed to excellence and community growth. Ndi Igbo kwenu!",
  "{profession} | {state} native | Building bridges between tradition and technology.",
  "Experienced {profession} focused on {industry}. Connecting the Igbo diaspora through professional excellence.",
  "{years}+ years in {industry}. Originally from {state}, now contributing to the global Igbo community.",
  "Creative {profession} blending Igbo cultural values with modern {industry} practices.",
  "{profession} with a passion for mentoring the next generation of Igbo professionals.",
  "From {state} to the world. {profession} dedicated to community empowerment and sustainable growth.",
];

const CULTURAL_CONNECTIONS = ["Imo", "Anambra", "Enugu", "Abia", "Ebonyi", "Delta", "Rivers"];

const INTERESTS = [
  "culture",
  "music",
  "food",
  "history",
  "language",
  "arts",
  "fashion",
  "diaspora",
  "technology",
  "entrepreneurship",
  "sports",
  "education",
  "community development",
];

const WORK_MODES = ["remote", "on-site", "hybrid"];

const UNIVERSITIES = [
  "University of Nigeria, Nsukka",
  "Nnamdi Azikiwe University",
  "Federal University of Technology, Owerri",
  "Imo State University",
  "Enugu State University of Science and Technology",
  "Abia State University",
  "University of Lagos",
  "University of Ibadan",
  "Obafemi Awolowo University",
  "Covenant University",
  "University of Benin",
  "Ahmadu Bello University",
  "Federal University Oye-Ekiti",
  "Lagos State University",
  "University of Port Harcourt",
];

const DEGREES = [
  "Bachelor of Science",
  "Bachelor of Engineering",
  "Bachelor of Arts",
  "Master of Science",
  "Master of Business Administration",
  "Bachelor of Technology",
  "Master of Engineering",
  "Bachelor of Education",
  "Doctor of Philosophy",
];

const FIELDS_OF_STUDY = [
  "Computer Science",
  "Electrical Engineering",
  "Mechanical Engineering",
  "Business Administration",
  "Economics",
  "Accounting",
  "Marketing",
  "Civil Engineering",
  "Medicine",
  "Law",
  "Education",
  "Agriculture",
  "Public Health",
  "Chemistry",
  "Physics",
  "Mathematics",
  "Information Technology",
  "Nursing",
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function pickRandomN<T>(arr: T[], min: number, max: number): T[] {
  const count = Math.floor(Math.random() * (max - min + 1)) + min;
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function randomPastDate(daysBack = 180): Date {
  const now = Date.now();
  return new Date(now - Math.random() * daysBack * 24 * 60 * 60 * 1000);
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function safeInsert<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err: unknown) {
    const e = err as {
      cause?: { message?: string; code?: string; detail?: string };
      message?: string;
    };
    console.error(`\n  DB INSERT FAILED [${label}]`);
    if (e.cause) {
      console.error(`  PostgresError: ${e.cause.message}`);
      console.error(`  code: ${e.cause.code}`);
      if (e.cause.detail) console.error(`  detail: ${e.cause.detail}`);
    } else {
      console.error(`  error: ${e.message}`);
    }
    throw err;
  }
}

function generateBio(profession: string, state: string, industry: string): string {
  const template = pickRandom(BIO_TEMPLATES);
  const years = randomInt(2, 15).toString();
  return template
    .replace(/{profession}/g, profession)
    .replace(/{state}/g, state)
    .replace(/{industry}/g, industry)
    .replace(/{years}/g, years);
}

function generateExperience(): object[] {
  const count = randomInt(1, 3);
  const entries = [];
  let currentYear = 2026;
  for (let i = 0; i < count; i++) {
    const duration = randomInt(1, 4);
    const endYear = currentYear;
    const startYear = endYear - duration;
    entries.push({
      title: pickRandom(JOB_TITLES),
      company: `${pickRandom(IGBO_SURNAMES)} ${pickRandom(["Ltd", "Corp", "Inc", "Group", "& Co"])}`,
      startDate: `${startYear}-${String(randomInt(1, 12)).padStart(2, "0")}`,
      endDate: i === 0 ? "Present" : `${endYear}-${String(randomInt(1, 12)).padStart(2, "0")}`,
      description: `Responsible for key ${pickRandom(INDUSTRIES).toLowerCase()} initiatives and team coordination.`,
    });
    currentYear = startYear;
  }
  return entries;
}

function generateEducation(): object[] {
  const count = randomInt(1, 2);
  const entries = [];
  for (let i = 0; i < count; i++) {
    entries.push({
      institution: pickRandom(UNIVERSITIES),
      degree: pickRandom(DEGREES),
      field: pickRandom(FIELDS_OF_STUDY),
      graduationYear: randomInt(2005, 2024),
    });
  }
  return entries;
}

// ─────────────────────────────────────────────────────────────────────────────
// Build user data
// ─────────────────────────────────────────────────────────────────────────────

interface UserData {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  location: Location;
  tier: "BASIC" | "PROFESSIONAL" | "TOP_TIER";
  lang: "en" | "ig";
  portalRole: "JOB_SEEKER" | "EMPLOYER";
  culturalConnections: string[];
  interests: string[];
  skills: string[];
  headline: string;
}

function buildUsers(): UserData[] {
  const allFirstNames = [...IGBO_FIRST_NAMES_MALE, ...IGBO_FIRST_NAMES_FEMALE];
  const users: UserData[] = [];
  const usedEmails = new Set<string>();

  for (let i = 0; i < TOTAL_USERS; i++) {
    const firstName = pickRandom(allFirstNames);
    const lastName = pickRandom(IGBO_SURNAMES);

    // Generate unique email
    let email: string;
    let suffix = i + 1;
    do {
      email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${String(suffix).padStart(3, "0")}@igbo.global`;
      suffix++;
    } while (usedEmails.has(email));
    usedEmails.add(email);

    // Location distribution: 500 Nigeria, 250 Africa, 250 World
    let location: Location;
    if (i < 500) {
      location = pickRandom(NIGERIA_LOCATIONS);
    } else if (i < 750) {
      location = pickRandom(AFRICA_LOCATIONS);
    } else {
      location = pickRandom(WORLD_LOCATIONS);
    }

    // Tier: 70% BASIC, 20% PROFESSIONAL, 10% TOP_TIER
    const tierRoll = Math.random();
    const tier = tierRoll < 0.7 ? "BASIC" : tierRoll < 0.9 ? "PROFESSIONAL" : "TOP_TIER";

    // Language: 80% en, 20% ig
    const lang = Math.random() < 0.8 ? "en" : "ig";

    // Portal role: first 10 are employers
    const portalRole = i < EMPLOYER_COUNT ? "EMPLOYER" : "JOB_SEEKER";

    const skills = pickRandomN(SKILLS, 3, 8);
    const headline = `${pickRandom(JOB_TITLES)} | ${pickRandom(INDUSTRIES)}`;

    users.push({
      id: randomUUID(),
      firstName,
      lastName,
      email,
      location,
      tier,
      lang,
      portalRole,
      culturalConnections: pickRandomN(CULTURAL_CONNECTIONS, 1, 3),
      interests: pickRandomN(INTERESTS, 2, 5),
      skills,
      headline,
    });
  }

  return users;
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed phases
// ─────────────────────────────────────────────────────────────────────────────

async function isAlreadySeeded(): Promise<boolean> {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(authUsers)
    .where(sql`email LIKE '%@igbo.global'`);
  const count = Number(result[0]?.count ?? 0);
  if (count > 0) {
    console.info(`  Found ${count} existing @igbo.global users`);
    return true;
  }
  return false;
}

async function seedAuthUsers(users: UserData[], passwordHash: string): Promise<void> {
  console.info("Phase 1: Inserting auth_users...");
  const now = new Date();

  const rows = users.map((u) => ({
    id: u.id,
    email: u.email,
    emailVerified: now,
    name: `${u.firstName} ${u.lastName}`,
    locationCity: u.location.city,
    locationState: u.location.state,
    locationCountry: u.location.country,
    culturalConnection: pickRandom(CULTURAL_CONNECTIONS),
    reasonForJoining: "Community member",
    consentGivenAt: now,
    consentVersion: "1.0",
    accountStatus: "APPROVED" as const,
    passwordHash,
    role: "MEMBER" as const,
    membershipTier: u.tier,
    languagePreference: u.lang,
    createdAt: randomPastDate(365),
    updatedAt: now,
  }));

  for (const [i, batch] of chunk(rows, BATCH_SIZE).entries()) {
    await safeInsert(`auth-users-batch-${i}`, () =>
      db.insert(authUsers).values(batch).onConflictDoNothing(),
    );
  }
  console.info(`  Done: ${rows.length} auth_users`);
}

async function seedCommunityProfiles(users: UserData[]): Promise<void> {
  console.info("Phase 2: Inserting community_profiles...");
  const now = new Date();

  const rows = users.map((u) => ({
    id: randomUUID(),
    userId: u.id,
    displayName: `${u.firstName} ${u.lastName}`,
    bio: generateBio(
      pickRandom(JOB_TITLES),
      pickRandom(CULTURAL_CONNECTIONS),
      pickRandom(INDUSTRIES),
    ),
    locationCity: u.location.city,
    locationState: u.location.state,
    locationCountry: u.location.country,
    interests: u.interests,
    culturalConnections: u.culturalConnections,
    languages: u.lang === "ig" ? ["ig", "en"] : ["en", "ig"],
    profileCompletedAt: randomPastDate(300),
    guidelinesAcknowledgedAt: randomPastDate(300),
    profileVisibility: "PUBLIC_TO_MEMBERS" as const,
    locationVisible: true,
    followerCount: 0,
    followingCount: 0,
    createdAt: randomPastDate(365),
    updatedAt: now,
  }));

  for (const [i, batch] of chunk(rows, BATCH_SIZE).entries()) {
    await safeInsert(`community-profiles-batch-${i}`, () =>
      db.insert(communityProfiles).values(batch).onConflictDoNothing(),
    );
  }
  console.info(`  Done: ${rows.length} community_profiles`);
}

async function seedUserRoles(users: UserData[], roleMap: Map<string, string>): Promise<void> {
  console.info("Phase 3: Inserting auth_user_roles...");
  const now = new Date();

  const rows = users.map((u) => {
    const roleId = roleMap.get(u.portalRole);
    if (!roleId) {
      throw new Error(`Role ${u.portalRole} not found in auth_roles table`);
    }
    return {
      id: randomUUID(),
      userId: u.id,
      roleId,
      assignedAt: now,
    };
  });

  for (const [i, batch] of chunk(rows, BATCH_SIZE).entries()) {
    await safeInsert(`user-roles-batch-${i}`, () =>
      db.insert(authUserRoles).values(batch).onConflictDoNothing(),
    );
  }
  console.info(`  Done: ${rows.length} auth_user_roles`);
}

async function seedSeekerProfiles(users: UserData[]): Promise<Map<string, string>> {
  console.info("Phase 4: Inserting portal_seeker_profiles...");
  const seekers = users.filter((u) => u.portalRole === "JOB_SEEKER");
  const now = new Date();

  // Map userId -> seekerProfileId for preferences
  const seekerProfileIdMap = new Map<string, string>();

  const rows = seekers.map((u) => {
    const profileId = randomUUID();
    seekerProfileIdMap.set(u.id, profileId);
    return {
      id: profileId,
      userId: u.id,
      headline: u.headline,
      summary: generateBio(
        pickRandom(JOB_TITLES),
        pickRandom(CULTURAL_CONNECTIONS),
        pickRandom(INDUSTRIES),
      ),
      skills: u.skills,
      experienceJson: generateExperience(),
      educationJson: generateEducation(),
      visibility: "active",
      consentMatching: Math.random() < 0.7,
      consentEmployerView: Math.random() < 0.6,
      onboardingCompletedAt: randomPastDate(200),
      createdAt: randomPastDate(300),
      updatedAt: now,
    };
  });

  for (const [i, batch] of chunk(rows, BATCH_SIZE).entries()) {
    await safeInsert(`seeker-profiles-batch-${i}`, () =>
      db.insert(portalSeekerProfiles).values(batch).onConflictDoNothing(),
    );
  }
  console.info(`  Done: ${seekers.length} portal_seeker_profiles`);
  return seekerProfileIdMap;
}

async function seedSeekerPreferences(
  users: UserData[],
  seekerProfileIdMap: Map<string, string>,
): Promise<void> {
  console.info("Phase 5: Inserting portal_seeker_preferences...");
  const seekers = users.filter((u) => u.portalRole === "JOB_SEEKER");
  const now = new Date();

  const rows = seekers.map((u) => {
    const seekerProfileId = seekerProfileIdMap.get(u.id);
    if (!seekerProfileId) throw new Error(`Missing seekerProfileId for ${u.id}`);

    const salaryMin = randomInt(100000, 500000);
    const salaryMax = salaryMin + randomInt(100000, 500000);

    return {
      id: randomUUID(),
      seekerProfileId,
      desiredRoles: pickRandomN(DESIRED_ROLES, 1, 3),
      salaryMin,
      salaryMax,
      salaryCurrency: u.location.country === "Nigeria" ? "NGN" : "USD",
      locations: [u.location.city, u.location.country],
      workModes: pickRandomN(WORK_MODES, 1, 2),
      createdAt: randomPastDate(200),
      updatedAt: now,
    };
  });

  for (const [i, batch] of chunk(rows, BATCH_SIZE).entries()) {
    await safeInsert(`seeker-preferences-batch-${i}`, () =>
      db.insert(portalSeekerPreferences).values(batch).onConflictDoNothing(),
    );
  }
  console.info(`  Done: ${seekers.length} portal_seeker_preferences`);
}

async function seedCompanyProfiles(users: UserData[]): Promise<void> {
  console.info("Phase 6: Inserting portal_company_profiles...");
  const employers = users.filter((u) => u.portalRole === "EMPLOYER");
  const now = new Date();

  const rows = employers.map((u, i) => ({
    id: randomUUID(),
    ownerUserId: u.id,
    name: COMPANY_NAMES[i] ?? `${u.lastName} Enterprises`,
    description: `Leading ${pickRandom(INDUSTRIES).toLowerCase()} company founded by Igbo entrepreneurs. Committed to excellence, innovation, and community impact.`,
    industry: pickRandom(INDUSTRIES),
    companySize: pickRandom(COMPANY_SIZES),
    onboardingCompletedAt: randomPastDate(200),
    createdAt: randomPastDate(300),
    updatedAt: now,
  }));

  await safeInsert("company-profiles", () =>
    db.insert(portalCompanyProfiles).values(rows).onConflictDoNothing(),
  );
  console.info(`  Done: ${employers.length} portal_company_profiles`);
}

async function seedFollows(users: UserData[]): Promise<void> {
  console.info("Phase 7: Inserting community_member_follows...");

  const userIds = users.map((u) => u.id);
  const seen = new Set<string>();
  const followRows: { followerId: string; followingId: string; createdAt: Date }[] = [];

  // Each user follows 3–30 others (power-law: most follow few, some follow many)
  for (const userId of userIds) {
    const count = Math.floor(3 + 27 * Math.pow(Math.random(), 2));
    for (let i = 0; i < count; i++) {
      const targetId = pickRandom(userIds);
      if (targetId === userId) continue;
      const key = `${userId}:${targetId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      followRows.push({
        followerId: userId,
        followingId: targetId,
        createdAt: randomPastDate(300),
      });
    }
  }

  for (const [i, batch] of chunk(followRows, BATCH_SIZE).entries()) {
    await safeInsert(`follows-batch-${i}`, () =>
      db.insert(communityMemberFollows).values(batch).onConflictDoNothing(),
    );
  }

  // Update denormalized follower/following counts on community_profiles
  await db.execute(sql`
    UPDATE community_profiles SET
      follower_count = (
        SELECT COUNT(*) FROM community_member_follows
        WHERE community_member_follows.following_id = community_profiles.user_id
      ),
      following_count = (
        SELECT COUNT(*) FROM community_member_follows
        WHERE community_member_follows.follower_id = community_profiles.user_id
      )
    WHERE user_id = ANY(${userIds}::uuid[])
  `);

  console.info(`  Done: ${followRows.length} follows`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.info("Igbo users seeder starting...");
  console.info(`  Target: ${DATABASE_URL!.replace(/:[^:@]+@/, ":***@")}`);

  if (await isAlreadySeeded()) {
    console.info("Database already has @igbo.global users. Skipping.");
    await client.end();
    return;
  }

  // Look up role IDs
  const roles = await db.select().from(authRoles);
  const roleMap = new Map(roles.map((r) => [r.name, r.id]));

  if (!roleMap.has("JOB_SEEKER")) {
    throw new Error("JOB_SEEKER role not found in auth_roles table. Run migrations first.");
  }
  if (!roleMap.has("EMPLOYER")) {
    throw new Error("EMPLOYER role not found in auth_roles table. Run migrations first.");
  }

  console.info("  Hashing password...");
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  console.info("  Building user data...");
  const users = buildUsers();

  const start = Date.now();

  await seedAuthUsers(users, passwordHash);
  await seedCommunityProfiles(users);
  await seedUserRoles(users, roleMap);
  const seekerProfileIdMap = await seedSeekerProfiles(users);
  await seedSeekerPreferences(users, seekerProfileIdMap);
  await seedCompanyProfiles(users);
  await seedFollows(users);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.info(`\nSeeding complete in ${elapsed}s`);
  console.info(`  Total users: ${TOTAL_USERS}`);
  console.info(`  Seekers: ${SEEKER_COUNT}`);
  console.info(`  Employers: ${EMPLOYER_COUNT}`);
  console.info(`  Nigeria: 500, Africa: 250, World: 250`);

  await client.end();
}

main().catch((err) => {
  if (err?.cause) {
    console.error("Seeder failed (root cause):", err.cause.message ?? err.cause);
    console.error("  code:", err.cause.code);
    console.error("  detail:", err.cause.detail);
  }
  console.error("Seeder failed:", err.message ?? err);
  process.exit(1);
});
