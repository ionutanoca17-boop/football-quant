export async function onRequestGet({ request, env }) {
  const token = env.FOOTBALL_DATA_TOKEN;

  if (!token) {
    return Response.json(
      { error: "Token API non configurato su Cloudflare." },
      { status: 500 }
    );
  }

  const url = new URL(request.url);
  const competition = (
    url.searchParams.get("competition") || "SA"
  ).toUpperCase();

  const allowed = ["SA", "PL", "PD", "BL1", "FL1", "CL"];

  if (!allowed.includes(competition)) {
    return Response.json(
      { error: "Competizione non supportata." },
      { status: 400 }
    );
  }

  const apiUrl =
    `https://api.football-data.org/v4/competitions/${competition}/matches`;

  try {
    const response = await fetch(apiUrl, {
      headers: {
        "X-Auth-Token": token
      }
    });

    if (!response.ok) {
      return Response.json(
        {
          error: "Errore restituito da Football-Data.org",
          apiStatus: response.status
        },
        { status: 502 }
      );
    }

    const data = await response.json();

    return Response.json({
      competition,
      count: (data.matches || []).length,
      matches: (data.matches || []).map(match => ({
        id: match.id,
        date: match.utcDate,
        status: match.status,
        home: match.homeTeam?.name || "Casa",
        away: match.awayTeam?.name || "Ospite",
        homeGoals: match.score?.fullTime?.home ?? null,
        awayGoals: match.score?.fullTime?.away ?? null
      }))
    });
  } catch {
    return Response.json(
      { error: "Impossibile contattare Football-Data.org." },
      { status: 502 }
    );
  }
}
