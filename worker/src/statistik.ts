export async function speichereSpielStatistik(
  uid: string,
  statistik: { geworfen: boolean; gefangen: number; distanzKm: number; ueberlebtSekunden: number },
  serviceAccountJson?: string
): Promise<void> {
  if (!serviceAccountJson || uid.startsWith('anon_')) return;

  try {
    const sa = JSON.parse(serviceAccountJson);
    const dbUrl = `https://${sa.project_id}-default-rtdb.europe-west1.firebasedatabase.app/statistik/${uid}.json`;

    await fetch(dbUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(statistik)
    });
  } catch (err) {
    console.error('Fehler beim Speichern der Statistik:', err);
  }
}
