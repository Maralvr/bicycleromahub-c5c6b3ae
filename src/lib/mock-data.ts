export type Staff = {
  id: string;
  name: string;
  avatar: string;
  role: "guide" | "rental" | "mechanic" | "admin";
  tags: string[];
  languages: string[];
  licenses: string[];
  status: "available" | "on_shift" | "off";
  phone: string;
  unavailability: { date: string; allDay: boolean; from?: string; to?: string; reason?: string }[];
};

export type Shift = {
  id: string;
  source: "bokun" | "manual";
  bookingId?: string;
  tourName: string;
  date: string; // YYYY-MM-DD
  startTime: string;
  endTime: string;
  meetingPoint: string;
  customer?: { name: string; phone: string };
  participants?: { adults: number; teens: number; infants: number; trailers: number };
  rate?: number;
  notes?: string;
  assignedStaffId: string | null;
  status: "pending" | "accepted" | "rejected" | "unassigned";
  requiredTags: string[];
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

export type FieldUpdate = {
  id: string;
  authorId: string;
  message: string;
  type: "broadcast" | "field";
  time: string;
};

export const staff: Staff[] = [
  { id: "s1", name: "Marco Rossi", avatar: "MR", role: "guide", tags: ["e-bike", "Vatican tour", "Colosseum tour"], languages: ["IT", "EN", "ES"], licenses: ["B", "First aid"], status: "on_shift", phone: "+39 333 1234567", unavailability: [{ date: "2026-04-26", allDay: true, reason: "Personal" }] },
  { id: "s2", name: "Giulia Bianchi", avatar: "GB", role: "guide", tags: ["e-bike", "Appian Way", "kids tour"], languages: ["IT", "EN", "FR"], licenses: ["B", "Tour guide"], status: "available", phone: "+39 333 2345678", unavailability: [] },
  { id: "s3", name: "Luca Conti", avatar: "LC", role: "rental", tags: ["rental desk", "fitting"], languages: ["IT", "EN"], licenses: ["B"], status: "available", phone: "+39 333 3456789", unavailability: [{ date: "2026-04-25", allDay: false, from: "14:00", to: "18:00" }] },
  { id: "s4", name: "Sofia Marino", avatar: "SM", role: "guide", tags: ["e-bike", "Colosseum tour", "night tour"], languages: ["IT", "EN", "DE"], licenses: ["B", "First aid"], status: "off", phone: "+39 333 4567890", unavailability: [] },
  { id: "s5", name: "Davide Ferri", avatar: "DF", role: "mechanic", tags: ["maintenance", "tire check"], languages: ["IT"], licenses: ["B"], status: "available", phone: "+39 333 5678901", unavailability: [] },
  { id: "s6", name: "Elena Greco", avatar: "EG", role: "guide", tags: ["e-bike", "Vatican tour", "private tour"], languages: ["IT", "EN", "JP"], licenses: ["B", "Tour guide"], status: "on_shift", phone: "+39 333 6789012", unavailability: [] },
];

const today = new Date().toISOString().slice(0, 10);
const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

export const shifts: Shift[] = [
  { id: "sh1", source: "bokun", bookingId: "BKN-48291", tourName: "Colosseum & Roman Forum E-Bike Tour", date: today, startTime: "09:30", endTime: "12:30", meetingPoint: "Piazza Venezia, Rome", customer: { name: "John Smith", phone: "+1 555 0142" }, participants: { adults: 4, teens: 1, infants: 0, trailers: 0 }, rate: 240, notes: "One vegetarian guest", assignedStaffId: "s1", status: "accepted", requiredTags: ["e-bike", "Colosseum tour"] },
  { id: "sh2", source: "bokun", bookingId: "BKN-48295", tourName: "Vatican Highlights E-Bike Tour", date: today, startTime: "14:00", endTime: "17:00", meetingPoint: "Castel Sant'Angelo", customer: { name: "Marie Dupont", phone: "+33 6 11 22 33 44" }, participants: { adults: 2, teens: 0, infants: 1, trailers: 1 }, rate: 180, assignedStaffId: "s6", status: "pending", requiredTags: ["e-bike", "Vatican tour"] },
  { id: "sh3", source: "manual", tourName: "Rental desk — afternoon", date: today, startTime: "13:00", endTime: "19:00", meetingPoint: "Shop — Via del Corso", assignedStaffId: "s3", status: "accepted", requiredTags: ["rental desk"] },
  { id: "sh4", source: "bokun", bookingId: "BKN-48312", tourName: "Appian Way Sunset Tour", date: tomorrow, startTime: "17:30", endTime: "20:30", meetingPoint: "Porta San Sebastiano", customer: { name: "Hans Müller", phone: "+49 151 23456789" }, participants: { adults: 6, teens: 2, infants: 0, trailers: 0 }, rate: 420, assignedStaffId: null, status: "unassigned", requiredTags: ["e-bike", "Appian Way"] },
  { id: "sh5", source: "bokun", bookingId: "BKN-48320", tourName: "Night Rome E-Bike Tour", date: tomorrow, startTime: "20:00", endTime: "22:30", meetingPoint: "Piazza del Popolo", customer: { name: "Akiko Tanaka", phone: "+81 90 1234 5678" }, participants: { adults: 3, teens: 0, infants: 0, trailers: 0 }, rate: 195, assignedStaffId: "s4", status: "pending", requiredTags: ["e-bike", "night tour"] },
];

export const tasks: Task[] = [
  { id: "t1", title: "Check tire pressure on fleet (15 bikes)", assigneeId: "s5", due: today, priority: "high", done: false },
  { id: "t2", title: "Set up meeting point signage — Piazza Venezia", assigneeId: "s1", due: today, priority: "medium", done: true },
  { id: "t3", title: "Restock helmets and water bottles", assigneeId: "s3", due: today, priority: "medium", done: false },
  { id: "t4", title: "Charge e-bike batteries (overnight)", assigneeId: "s5", due: tomorrow, priority: "high", done: false },
  { id: "t5", title: "Print Vatican tour vouchers", assigneeId: "s3", due: tomorrow, priority: "low", done: false },
];

export const updates: FieldUpdate[] = [
  { id: "u1", authorId: "s1", message: "Road works on Via dei Fori Imperiali — rerouting via Via Cavour.", type: "field", time: "10:24" },
  { id: "u2", authorId: "admin", message: "Reminder: new helmet check protocol starts Monday.", type: "broadcast", time: "09:10" },
  { id: "u3", authorId: "s6", message: "Meeting point at Castel Sant'Angelo crowded today, suggesting east entrance.", type: "field", time: "08:45" },
];
