/**
 * Posts sample attendance rows (one per active FEC branch) via the ingest API.
 *
 * Usage:
 *   node --env-file=.env.local scripts/seed-attendance-ingest-sample.mjs
 *
 * Env:
 *   ATTENDANCE_INGEST_API_KEY — required
 *   FEC_BASE_URL — optional (default http://localhost:3000)
 */
const baseUrl = (process.env.FEC_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const apiKey = process.env.ATTENDANCE_INGEST_API_KEY;

if (!apiKey) {
  console.error("Missing ATTENDANCE_INGEST_API_KEY in environment.");
  process.exit(1);
}

const payload = {
  records: [
    {
      location: "Urban Arena - Doha Mall",
      user_name: "Waqar",
      date: "23-06-2026",
      first_check_in: "2:27:51 PM",
      last_check_out: null,
      total_hours_worked: 0,
      overtime: false,
      overtime_hours: 0,
      status: "Missing Punch",
    },
    {
      location: "Inflatapark - City Center",
      user_name: "Mary",
      date: "25-06-2026",
      first_check_in: "2:27:43 PM",
      last_check_out: "6:27:53 PM",
      total_hours_worked: 6,
      overtime: false,
      overtime_hours: 0,
      status: "Incomplete",
    },
    {
      location: "Kids Driving School - City Center",
      user_name: "Ashfaq",
      date: "28-06-2026",
      first_check_in: "3:40:32 PM",
      last_check_out: null,
      total_hours_worked: 0,
      overtime: false,
      overtime_hours: 0,
      status: "Missing Punch",
    },
    {
      location: "Kids Driving School Mini - Doha Mall",
      user_name: "Mazin",
      date: "28-06-2026",
      first_check_in: "10:15:00 AM",
      last_check_out: "6:30:00 PM",
      total_hours_worked: 8,
      overtime: false,
      overtime_hours: 0,
      status: "Incomplete",
    },
    {
      location: "Carousel - Aspire Park",
      user_name: "Zaryab",
      date: "28-06-2026",
      first_check_in: "9:06:00 AM",
      last_check_out: "7:06:11 PM",
      total_hours_worked: 10,
      overtime: true,
      overtime_hours: 1,
      status: "Incomplete",
    },
    {
      location: "Crayons & Bricks - Vendome Mall",
      user_name: "Rosebelt",
      date: "27-06-2026",
      first_check_in: "11:00:00 AM",
      last_check_out: "7:15:00 PM",
      total_hours_worked: 8,
      overtime: false,
      overtime_hours: 0,
      status: "Incomplete",
    },
    {
      location: "Crayons & Bricks - Dar Al Salam Mall",
      user_name: "Romel",
      date: "26-06-2026",
      first_check_in: "9:30:00 AM",
      last_check_out: "5:45:00 PM",
      total_hours_worked: 8,
      overtime: false,
      overtime_hours: 0,
      status: "Incomplete",
    },
    {
      location: "Winter Mirage - Vendome Mall",
      user_name: "Rabah",
      date: "29-06-2026",
      first_check_in: "8:00:00 AM",
      last_check_out: "4:30:00 PM",
      total_hours_worked: 8,
      overtime: false,
      overtime_hours: 0,
      status: "Incomplete",
    },
  ],
};

const res = await fetch(`${baseUrl}/api/public/attendance-ingest`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(payload),
});

const body = await res.json();
console.log(`HTTP ${res.status}`);
console.log(JSON.stringify(body, null, 2));

if (!res.ok || body.failed > 0) {
  process.exit(1);
}
