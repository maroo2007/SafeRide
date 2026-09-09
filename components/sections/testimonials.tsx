/**
 * §4.8 Testimonials — four quotes, marked up as quotes.
 *
 * <blockquote> with a <figcaption>, not a div with big text. The attribution
 * belongs to the quote and the markup should say so; a screen reader then
 * reads "quote ... Ahmed Hassan, Parent, Modern School" as one unit rather
 * than as a paragraph followed by an orphan name.
 *
 * Two columns rather than four: these are long. At a quarter of the width the
 * third quote wraps to eleven lines and reads as a wall.
 *
 * Copy verbatim from https://safe-ridee.vercel.app/ (spec 12).
 */

const QUOTES: { quote: string; name: string; role: string }[] = [
  {
    quote:
      "Every morning I used to call the school twice just to make sure my daughter got on the bus. Now I open the app and I can see exactly where she is. It changed how I feel about the whole school run.",
    name: "Ahmed Hassan",
    role: "Parent, Modern School",
  },
  {
    quote:
      "The first time I got a notification that said 'Sara boarded safely,' I actually teared up. It sounds small, but that peace of mind is everything when you're a working mother.",
    name: "Mona Ali",
    role: "Mother, Future Language School",
  },
  {
    quote:
      "We used to manage transportation with a notebook and a lot of phone calls. SafeRide gave us one dashboard for every bus, every driver, and every route. It's the biggest operational upgrade we've made in years.",
    name: "Dr. Karim El-Sayed",
    role: "Principal, El Rowad International School",
  },
  {
    quote:
      "Our front desk used to spend the first hour of every school day answering 'where is the bus' calls. Since we switched to SafeRide, those calls have almost completely stopped.",
    name: "Nourhan Fathy",
    role: "Administrator, Smart Vision School",
  },
];

export function Testimonials() {
  return (
    <ul className="grid gap-6 sm:grid-cols-2">
      {QUOTES.map((q) => (
        <li key={q.name}>
          <figure className="flex h-full flex-col rounded-brand border border-border p-6">
            <blockquote className="flex-1">
              <p className="text-lg leading-relaxed">{q.quote}</p>
            </blockquote>
            <figcaption className="mt-6 border-t border-border pt-4">
              <span className="block font-semibold">{q.name}</span>
              <span className="block text-sm text-muted-foreground">{q.role}</span>
            </figcaption>
          </figure>
        </li>
      ))}
    </ul>
  );
}
