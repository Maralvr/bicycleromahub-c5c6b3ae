import { createContext, useContext, useState, ReactNode, useEffect } from "react";

export type Lang = "en" | "it";

const dict = {
  en: {
    appName: "Bicycle Roma",
    tagline: "Operations Hub",
    nav: { dashboard: "Dashboard", staff: "Team", shifts: "Shifts", calendar: "Calendar", tasks: "Tasks", notifications: "Updates", myAvailability: "My availability", myShifts: "My shifts", rentalPoints: "Rental points", liveShifts: "Live shifts", payouts: "Payouts", bokunRuns: "Bokun runs", dispatchLog: "Dispatch log", users: "Users" },
    shell: { language: "Language", workspace: "Workspace", myWorkspace: "My workspace", actingAs: "Acting as", signOut: "Sign out", switchToGuide: "Switch to Guide view", switchToAdmin: "Switch to Admin view" },
    common: {
      today: "Today", upcoming: "Upcoming", pending: "Pending", accepted: "Accepted",
      rejected: "Rejected", assigned: "Assigned", unassigned: "Unassigned",
      accept: "Accept", reject: "Reject", create: "Create", duplicate: "Duplicate",
      save: "Save", cancel: "Cancel", search: "Search", filter: "Filter",
      add: "Add", edit: "Edit", delete: "Delete", view: "View", all: "All",
      name: "Name", role: "Role", date: "Date", time: "Time", status: "Status",
      actions: "Actions", details: "Details", notes: "Notes", participants: "Participants",
      meetingPoint: "Meeting point", customer: "Customer", booking: "Booking",
      rate: "Rate", phone: "Phone", tags: "Tags", availability: "Availability",
      languages: "Languages", licenses: "Licenses", priority: "Priority",
      done: "Done", todo: "To do", high: "High", medium: "Medium", low: "Low",
    },
    dashboard: {
      title: "Dashboard", subtitle: "What's happening today across your operation.",
      shiftsToday: "Shifts today", pendingAccept: "Awaiting acceptance",
      activeStaff: "Active staff", openTasks: "Open tasks",
      coverageRisk: "Coverage at risk", upcomingShifts: "Upcoming shifts",
      recentActivity: "Recent field updates",
    },
    staff: {
      title: "Staff", subtitle: "Profiles, skills, and availability.",
      addStaff: "Add staff", searchPlaceholder: "Search by name, tag or language…",
      addUnavailability: "Add unavailability", availableNow: "Available now",
      onShift: "On shift", offDuty: "Off duty",
    },
    shifts: {
      title: "Shifts", subtitle: "Bokun bookings and manual assignments.",
      newShift: "New shift", fromBokun: "From Bokun", manual: "Manual",
      assignGuide: "Assign guide", suggested: "AI suggested",
      adults: "Adults", teens: "Teens", infants: "Infants", trailers: "Trailers",
      myShifts: "Mine",
    },
    tasks: {
      title: "Tasks", subtitle: "Daily checks and operational to-dos.",
      newTask: "New task", assignedTo: "Assigned to", due: "Due",
    },
    notifications: {
      title: "Notifications", subtitle: "Push messages and field updates from the team.",
      broadcast: "Broadcast to team", fieldUpdate: "Field update",
      sendMessage: "Send message", placeholder: "Type a message to the whole team…",
    },
  },
  it: {
    appName: "Bicycle Roma",
    tagline: "Centro Operativo",
    nav: { dashboard: "Dashboard", staff: "Team", shifts: "Turni", calendar: "Calendario", tasks: "Attività", notifications: "Aggiornamenti", myAvailability: "Disponibilità", myShifts: "I miei turni", rentalPoints: "Punti noleggio", liveShifts: "Turni live", payouts: "Pagamenti", bokunRuns: "Sync Bokun", dispatchLog: "Log invii", users: "Utenti" },
    shell: { language: "Lingua", workspace: "Area di lavoro", myWorkspace: "La mia area", actingAs: "Stai operando come", signOut: "Esci", switchToGuide: "Passa a vista Guida", switchToAdmin: "Passa a vista Admin" },
    common: {
      today: "Oggi", upcoming: "Prossimi", pending: "In attesa", accepted: "Accettato",
      rejected: "Rifiutato", assigned: "Assegnato", unassigned: "Non assegnato",
      accept: "Accetta", reject: "Rifiuta", create: "Crea", duplicate: "Duplica",
      save: "Salva", cancel: "Annulla", search: "Cerca", filter: "Filtra",
      add: "Aggiungi", edit: "Modifica", delete: "Elimina", view: "Vedi", all: "Tutti",
      name: "Nome", role: "Ruolo", date: "Data", time: "Ora", status: "Stato",
      actions: "Azioni", details: "Dettagli", notes: "Note", participants: "Partecipanti",
      meetingPoint: "Punto d'incontro", customer: "Cliente", booking: "Prenotazione",
      rate: "Tariffa", phone: "Telefono", tags: "Tag", availability: "Disponibilità",
      languages: "Lingue", licenses: "Licenze", priority: "Priorità",
      done: "Fatto", todo: "Da fare", high: "Alta", medium: "Media", low: "Bassa",
    },
    dashboard: {
      title: "Dashboard", subtitle: "Cosa succede oggi nella tua operatività.",
      shiftsToday: "Turni oggi", pendingAccept: "In attesa di accettazione",
      activeStaff: "Staff attivo", openTasks: "Attività aperte",
      coverageRisk: "Copertura a rischio", upcomingShifts: "Prossimi turni",
      recentActivity: "Aggiornamenti dal campo",
    },
    staff: {
      title: "Staff", subtitle: "Profili, competenze e disponibilità.",
      addStaff: "Aggiungi staff", searchPlaceholder: "Cerca per nome, tag o lingua…",
      addUnavailability: "Aggiungi indisponibilità", availableNow: "Disponibile ora",
      onShift: "In servizio", offDuty: "Fuori servizio",
    },
    shifts: {
      title: "Turni", subtitle: "Prenotazioni Bokun e assegnazioni manuali.",
      newShift: "Nuovo turno", fromBokun: "Da Bokun", manual: "Manuale",
      assignGuide: "Assegna guida", suggested: "Suggerito dall'AI",
      adults: "Adulti", teens: "Ragazzi", infants: "Bambini", trailers: "Carrelli",
      myShifts: "I miei",
    },
    tasks: {
      title: "Attività", subtitle: "Controlli giornalieri e to-do operativi.",
      newTask: "Nuova attività", assignedTo: "Assegnato a", due: "Scadenza",
    },
    notifications: {
      title: "Notifiche", subtitle: "Messaggi push e aggiornamenti dal campo.",
      broadcast: "Invia a tutto il team", fieldUpdate: "Aggiornamento dal campo",
      sendMessage: "Invia messaggio", placeholder: "Scrivi un messaggio al team…",
    },
  },
} as const;

type Dict = typeof dict.en;
const dictionaries: Record<Lang, Dict> = dict as unknown as Record<Lang, Dict>;

const I18nContext = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: Dict }>({
  lang: "en", setLang: () => {}, t: dict.en,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const saved = typeof window !== "undefined" ? (localStorage.getItem("lang") as Lang | null) : null;
    if (saved === "en" || saved === "it") setLangState(saved);
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    if (typeof window !== "undefined") localStorage.setItem("lang", l);
  };

  return (
    <I18nContext.Provider value={{ lang, setLang, t: dictionaries[lang] }}>
      {children}
    </I18nContext.Provider>
  );
}

export const useI18n = () => useContext(I18nContext);
