/** The real English FAQ from https://safe-ridee.vercel.app/ (spec §4.10). */
export const FAQ_EN: { q: string; a: string }[] = [
  { q: "How does face recognition attendance protect my child's privacy?",
    a: "Face data is stored as an encrypted mathematical embedding, not a photo, and is only used to confirm boarding and drop-off. Schools control retention, and families can opt in to manual or QR attendance instead." },
  { q: "How accurate is the live GPS tracking?",
    a: "Buses report their position on a short interval — typically every 10-15 seconds — giving parents an accurate, near-real-time view of the route without draining the driver's device battery." },
  { q: "What happens if a bus loses internet connection mid-route?",
    a: "Attendance and location data are cached on the device and sync automatically the moment connectivity returns, so a coverage gap never means lost records." },
  { q: "Can SafeRide integrate with our existing school systems?",
    a: "Integration with school ERPs and classroom platforms is on our roadmap. Today, SafeRide runs as a standalone platform your transportation team can adopt without replacing anything else." },
  { q: "How fast is the emergency response?",
    a: "A single tap from a driver or supervisor notifies the school, the affected parents, and the emergency operator simultaneously, with the bus's exact location attached automatically." },
  { q: "Is there a free trial?",
    a: "Yes. Starter plans include an onboarding period so your transportation team can run SafeRide alongside your current process before fully switching over." },
  { q: "What languages does SafeRide support?",
    a: "Full English and Arabic today, switching instantly for every role with no page reload. Additional languages are planned as SafeRide expands." },
];
