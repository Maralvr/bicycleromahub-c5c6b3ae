export type Staff = {
  id: string;
  /** auth user id (= profiles.id). null for legacy mock-only staff. */
  profileId?: string | null;
  /** True when this row reflects a real auth user from public.staff. */
  isLive?: boolean;
  name: string;
  avatar: string;
  avatarUrl?: string | null;
  role: "guide" | "rental" | "mechanic" | "admin";
  email?: string | null;
  active?: boolean;
  tags: string[];
  languages: string[];
  licenses: string[];
  status: "available" | "on_shift" | "off";
  phone: string;
  unavailability: { date: string; allDay: boolean; from?: string; to?: string; reason?: string }[];
};

export type GuideNote = {
  id: string;
  shiftId: string;
  authorStaffId: string;
  message: string;
  category: "general" | "bike_issue" | "customer" | "incident";
  createdAt: string; // ISO
  attachments?: Attachment[];
};

export type Shift = {
  id: string;
  source: "bokun" | "manual";
  bookingId?: string;
  channelBookingRef?: string | null;
  externalBookingRef?: string | null;
  tourName: string;
  date: string; // YYYY-MM-DD
  startTime: string;
  endTime: string;
  meetingPoint: string;
  customer?: { name: string; phone: string; email?: string | null };
  participants?: { adults: number; teens: number; infants: number; trailers: number };
  participantList?: { name: string; category: string }[];
  rate?: number;
  rateTitle?: string | null;
  seller?: string | null;
  bookingChannel?: string | null;
  notes?: string;
  operationsNotes?: string | null;
  assignedStaffId: string | null;
  status: "pending" | "accepted" | "rejected" | "unassigned";
  requiredTags: string[];
  guideNotes?: GuideNote[];
  pendingExpiresAt?: string | null;
  rejectionReason?: string | null;
  rejectedByStaffIds?: string[];
  noShow?: boolean;
  noShowReportedAt?: string | null;
  noShowReportedBy?: string | null;
  noShowNotes?: string | null;
};

export type Task = {
  id: string;
  title: string;
  description?: string;
  assigneeId: string;
  due: string;
  priority: "low" | "medium" | "high";
  done: boolean;
};

export type Attachment = {
  id: string;
  name: string;
  mime: string;
  size: number;
  /** Storage path in the private notification-attachments bucket. */
  path?: string;
  /** Legacy inline base64 data URL (pre-Storage rows) or local preview. */
  dataUrl?: string;
};

export type FieldUpdate = {
  id: string;
  authorId: string;
  message: string;
  type: "broadcast" | "field";
  time: string;
  createdAt?: string;
  attachments?: Attachment[];
};

export const staff: Staff[] = [
  {
    id: "s1",
    name: "Marco Rossi",
    avatar: "MR",
    role: "guide",
    tags: ["e-bike", "Vatican tour", "Colosseum tour"],
    languages: ["IT", "EN", "ES"],
    licenses: ["B", "First aid"],
    status: "on_shift",
    phone: "+39 333 1234567",
    unavailability: [{ date: "2026-04-26", allDay: true, reason: "Personal" }],
  },
  {
    id: "s2",
    name: "Giulia Bianchi",
    avatar: "GB",
    role: "guide",
    tags: ["e-bike", "Appian Way", "kids tour"],
    languages: ["IT", "EN", "FR"],
    licenses: ["B", "Tour guide"],
    status: "available",
    phone: "+39 333 2345678",
    unavailability: [],
  },
  {
    id: "s3",
    name: "Luca Conti",
    avatar: "LC",
    role: "rental",
    tags: ["rental desk", "fitting"],
    languages: ["IT", "EN"],
    licenses: ["B"],
    status: "available",
    phone: "+39 333 3456789",
    unavailability: [{ date: "2026-04-25", allDay: false, from: "14:00", to: "18:00" }],
  },
  {
    id: "s4",
    name: "Sofia Marino",
    avatar: "SM",
    role: "guide",
    tags: ["e-bike", "Colosseum tour", "night tour"],
    languages: ["IT", "EN", "DE"],
    licenses: ["B", "First aid"],
    status: "off",
    phone: "+39 333 4567890",
    unavailability: [],
  },
  {
    id: "s5",
    name: "Davide Ferri",
    avatar: "DF",
    role: "mechanic",
    tags: ["maintenance", "tire check"],
    languages: ["IT"],
    licenses: ["B"],
    status: "available",
    phone: "+39 333 5678901",
    unavailability: [],
  },
  {
    id: "s6",
    name: "Elena Greco",
    avatar: "EG",
    role: "guide",
    tags: ["e-bike", "Vatican tour", "private tour"],
    languages: ["IT", "EN", "JP"],
    licenses: ["B", "Tour guide"],
    status: "on_shift",
    phone: "+39 333 6789012",
    unavailability: [],
  },
];

const today = new Date().toISOString().slice(0, 10);
const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const dayAfter = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
const inThreeDays = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
const inFourDays = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);

export const shifts: Shift[] = [
  // TODAY
  {
    id: "sh1",
    source: "bokun",
    bookingId: "BKN-48291",
    tourName: "Colosseum & Roman Forum E-Bike Tour",
    date: today,
    startTime: "09:30",
    endTime: "12:30",
    meetingPoint: "Piazza Venezia, Rome",
    customer: { name: "John Smith", phone: "+1 555 0142" },
    participants: { adults: 4, teens: 1, infants: 0, trailers: 0 },
    rate: 240,
    notes: "One vegetarian guest",
    assignedStaffId: "s1",
    status: "accepted",
    requiredTags: ["e-bike", "Colosseum tour"],
  },
  {
    id: "sh2",
    source: "bokun",
    bookingId: "BKN-48295",
    tourName: "Vatican Highlights E-Bike Tour",
    date: today,
    startTime: "14:00",
    endTime: "17:00",
    meetingPoint: "Castel Sant'Angelo",
    customer: { name: "Marie Dupont", phone: "+33 6 11 22 33 44" },
    participants: { adults: 2, teens: 0, infants: 1, trailers: 1 },
    rate: 180,
    assignedStaffId: "s6",
    status: "pending",
    requiredTags: ["e-bike", "Vatican tour"],
  },
  {
    id: "sh3",
    source: "manual",
    tourName: "Rental desk — afternoon",
    date: today,
    startTime: "13:00",
    endTime: "19:00",
    meetingPoint: "Shop — Via del Corso",
    assignedStaffId: "s3",
    status: "accepted",
    requiredTags: ["rental desk"],
  },
  {
    id: "sh3b",
    source: "bokun",
    bookingId: "BKN-48298",
    tourName: "Trastevere Food & Bike Tour",
    date: today,
    startTime: "11:00",
    endTime: "14:30",
    meetingPoint: "Piazza Trilussa",
    customer: { name: "Emma Johnson", phone: "+44 7700 900123" },
    participants: { adults: 5, teens: 0, infants: 0, trailers: 0 },
    rate: 325,
    notes: "Gluten-free guest",
    assignedStaffId: null,
    status: "unassigned",
    requiredTags: ["e-bike", "kids tour"],
  },
  {
    id: "sh3c",
    source: "bokun",
    bookingId: "BKN-48301",
    tourName: "Private Vatican Tour",
    date: today,
    startTime: "15:30",
    endTime: "18:30",
    meetingPoint: "Via della Conciliazione",
    customer: { name: "Yuki Sato", phone: "+81 80 9876 5432" },
    participants: { adults: 2, teens: 0, infants: 0, trailers: 0 },
    rate: 380,
    notes: "VIP — Japanese-speaking guide preferred",
    assignedStaffId: null,
    status: "unassigned",
    requiredTags: ["e-bike", "Vatican tour", "private tour"],
  },

  // TOMORROW
  {
    id: "sh4",
    source: "bokun",
    bookingId: "BKN-48312",
    tourName: "Appian Way Sunset Tour",
    date: tomorrow,
    startTime: "17:30",
    endTime: "20:30",
    meetingPoint: "Porta San Sebastiano",
    customer: { name: "Hans Müller", phone: "+49 151 23456789" },
    participants: { adults: 6, teens: 2, infants: 0, trailers: 0 },
    rate: 420,
    assignedStaffId: null,
    status: "unassigned",
    requiredTags: ["e-bike", "Appian Way"],
  },
  {
    id: "sh5",
    source: "bokun",
    bookingId: "BKN-48320",
    tourName: "Night Rome E-Bike Tour",
    date: tomorrow,
    startTime: "20:00",
    endTime: "22:30",
    meetingPoint: "Piazza del Popolo",
    customer: { name: "Akiko Tanaka", phone: "+81 90 1234 5678" },
    participants: { adults: 3, teens: 0, infants: 0, trailers: 0 },
    rate: 195,
    assignedStaffId: "s4",
    status: "pending",
    requiredTags: ["e-bike", "night tour"],
  },
  {
    id: "sh5b",
    source: "bokun",
    bookingId: "BKN-48325",
    tourName: "Colosseum Morning E-Bike Tour",
    date: tomorrow,
    startTime: "09:00",
    endTime: "12:00",
    meetingPoint: "Piazza Venezia, Rome",
    customer: { name: "Carlos Ruiz", phone: "+34 600 112233" },
    participants: { adults: 8, teens: 0, infants: 0, trailers: 0 },
    rate: 480,
    notes: "Spanish-speaking group",
    assignedStaffId: null,
    status: "unassigned",
    requiredTags: ["e-bike", "Colosseum tour"],
  },
  {
    id: "sh5c",
    source: "manual",
    tourName: "Rental desk — morning",
    date: tomorrow,
    startTime: "09:00",
    endTime: "13:00",
    meetingPoint: "Shop — Via del Corso",
    assignedStaffId: null,
    status: "unassigned",
    requiredTags: ["rental desk"],
  },
  {
    id: "sh5d",
    source: "bokun",
    bookingId: "BKN-48330",
    tourName: "Kids & Family E-Bike Tour",
    date: tomorrow,
    startTime: "10:30",
    endTime: "13:00",
    meetingPoint: "Villa Borghese",
    customer: { name: "Sophie Laurent", phone: "+33 6 99 88 77 66" },
    participants: { adults: 2, teens: 1, infants: 0, trailers: 1 },
    rate: 220,
    notes: "2 kids age 8 and 11",
    assignedStaffId: "s2",
    status: "pending",
    requiredTags: ["e-bike", "kids tour"],
  },

  // DAY AFTER
  {
    id: "sh6",
    source: "bokun",
    bookingId: "BKN-48340",
    tourName: "Vatican Highlights E-Bike Tour",
    date: dayAfter,
    startTime: "10:00",
    endTime: "13:00",
    meetingPoint: "Castel Sant'Angelo",
    customer: { name: "Michael Brown", phone: "+1 415 555 0199" },
    participants: { adults: 4, teens: 0, infants: 0, trailers: 0 },
    rate: 240,
    assignedStaffId: null,
    status: "unassigned",
    requiredTags: ["e-bike", "Vatican tour"],
  },
  {
    id: "sh7",
    source: "bokun",
    bookingId: "BKN-48345",
    tourName: "Appian Way Morning Ride",
    date: dayAfter,
    startTime: "08:30",
    endTime: "12:00",
    meetingPoint: "Porta San Sebastiano",
    customer: { name: "Lisa Andersson", phone: "+46 70 123 4567" },
    participants: { adults: 3, teens: 1, infants: 0, trailers: 0 },
    rate: 245,
    assignedStaffId: null,
    status: "unassigned",
    requiredTags: ["e-bike", "Appian Way"],
  },
  {
    id: "sh8",
    source: "manual",
    tourName: "Fleet maintenance check",
    date: dayAfter,
    startTime: "14:00",
    endTime: "17:00",
    meetingPoint: "Workshop",
    notes: "Pre-weekend check on all 15 bikes",
    assignedStaffId: null,
    status: "unassigned",
    requiredTags: ["maintenance"],
  },

  // IN 3 DAYS
  {
    id: "sh9",
    source: "bokun",
    bookingId: "BKN-48360",
    tourName: "Night Rome E-Bike Tour",
    date: inThreeDays,
    startTime: "20:30",
    endTime: "23:00",
    meetingPoint: "Piazza del Popolo",
    customer: { name: "Tom Wilson", phone: "+44 7800 555111" },
    participants: { adults: 6, teens: 0, infants: 0, trailers: 0 },
    rate: 390,
    assignedStaffId: null,
    status: "unassigned",
    requiredTags: ["e-bike", "night tour"],
  },
  {
    id: "sh10",
    source: "bokun",
    bookingId: "BKN-48362",
    tourName: "Colosseum & Roman Forum E-Bike Tour",
    date: inThreeDays,
    startTime: "09:30",
    endTime: "12:30",
    meetingPoint: "Piazza Venezia, Rome",
    customer: { name: "Anna Schmidt", phone: "+49 170 9988776" },
    participants: { adults: 2, teens: 0, infants: 0, trailers: 0 },
    rate: 120,
    assignedStaffId: "s1",
    status: "pending",
    requiredTags: ["e-bike", "Colosseum tour"],
  },
  {
    id: "sh11",
    source: "manual",
    tourName: "Rental desk — full day",
    date: inThreeDays,
    startTime: "09:00",
    endTime: "19:00",
    meetingPoint: "Shop — Via del Corso",
    assignedStaffId: null,
    status: "unassigned",
    requiredTags: ["rental desk"],
  },

  // IN 4 DAYS
  {
    id: "sh12",
    source: "bokun",
    bookingId: "BKN-48380",
    tourName: "Private Colosseum Tour",
    date: inFourDays,
    startTime: "10:00",
    endTime: "13:30",
    meetingPoint: "Piazza Venezia, Rome",
    customer: { name: "Robert Chen", phone: "+1 212 555 0177" },
    participants: { adults: 4, teens: 0, infants: 0, trailers: 0 },
    rate: 560,
    notes: "VIP private booking",
    assignedStaffId: null,
    status: "unassigned",
    requiredTags: ["e-bike", "Colosseum tour", "private tour"],
  },
  {
    id: "sh13",
    source: "bokun",
    bookingId: "BKN-48385",
    tourName: "Vatican Highlights E-Bike Tour",
    date: inFourDays,
    startTime: "14:30",
    endTime: "17:30",
    meetingPoint: "Castel Sant'Angelo",
    customer: { name: "Pierre Martin", phone: "+33 6 22 33 44 55" },
    participants: { adults: 3, teens: 2, infants: 0, trailers: 0 },
    rate: 275,
    assignedStaffId: "s6",
    status: "pending",
    requiredTags: ["e-bike", "Vatican tour"],
  },
];

export const tasks: Task[] = [
  {
    id: "t1",
    title: "Check tire pressure on fleet (15 bikes)",
    assigneeId: "s5",
    due: today,
    priority: "high",
    done: false,
  },
  {
    id: "t2",
    title: "Set up meeting point signage — Piazza Venezia",
    assigneeId: "s1",
    due: today,
    priority: "medium",
    done: true,
  },
  {
    id: "t3",
    title: "Restock helmets and water bottles",
    assigneeId: "s3",
    due: today,
    priority: "medium",
    done: false,
  },
  {
    id: "t4",
    title: "Charge e-bike batteries (overnight)",
    assigneeId: "s5",
    due: tomorrow,
    priority: "high",
    done: false,
  },
  {
    id: "t5",
    title: "Print Vatican tour vouchers",
    assigneeId: "s3",
    due: tomorrow,
    priority: "low",
    done: false,
  },
];

export const updates: FieldUpdate[] = [
  {
    id: "u1",
    authorId: "s1",
    message: "Road works on Via dei Fori Imperiali — rerouting via Via Cavour.",
    type: "field",
    time: "10:24",
  },
  {
    id: "u2",
    authorId: "admin",
    message: "Reminder: new helmet check protocol starts Monday.",
    type: "broadcast",
    time: "09:10",
  },
  {
    id: "u3",
    authorId: "s6",
    message: "Meeting point at Castel Sant'Angelo crowded today, suggesting east entrance.",
    type: "field",
    time: "08:45",
  },
];
