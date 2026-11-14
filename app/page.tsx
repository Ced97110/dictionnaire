import Script from 'next/script';

// La page est une coquille : toute la logique (recherche, parcours guidé, thèmes,
// questions, fiches) est dans public/dictionnaire.js et lit les données de public/data.
export default function Page() {
  return (
    <>
      <main>
<header>
<h1>Dictionnaire de l'Invisible</h1>
<input id="q" type="search" placeholder="Mot anglais, mot français ou idée…" autoComplete="off" aria-label="Rechercher" />
<div className="tabs"><button id="tWiz" aria-pressed="true">Je connais le sens</button><button id="tSearch" aria-pressed="false">Chercher un mot</button><button id="tBrowse" aria-pressed="false">Thèmes</button><button id="tQuest" aria-pressed="false">Questions</button><button id="tGuide" aria-pressed="false">Mode d'emploi</button><button id="tAdd" aria-pressed="false">Ajouter</button></div>
</header>
<div id="out"><p className="st">Chargement de l'index…</p></div>
      </main>
      <Script src="/dictionnaire.js" strategy="afterInteractive" />
      <Script src="/ajout.js" strategy="afterInteractive" />
      <Script src="/glose.js" strategy="afterInteractive" />
    </>
  );
}
