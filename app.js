// ========================================================
// Application Gestion Stock & Matériel (GM2026)
// ========================================================

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// État global
let currentUser = null;
let currentTab = 'dashboard';
let articlesCache = [];
let pageArticles = 1;
let queryArticles = '';
let filterCat = '';
let filterStatut = '';

let pageMouv = 1;
let queryMouv = '';
let filterMouvType = 'all';

let editArtId = null;
let editFournId = null;
let editBureauId = null;
let editUserId = null;

let allSuppliers = [];
let allOffices = [];
let appCurrency = '€';

// Helper API robuste
async function api(action, body = null, params = '') {
  try {
    const res = await fetch(`api.php?action=${action}${params}`, body ? {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    } : {});

    // Lecture du texte brut pour éviter toute exception fatale sur JSON vide
    const text = await res.text();
    let data = {};
    if (text && text.trim() !== '') {
      try {
        data = JSON.parse(text);
      } catch (parseErr) {
        console.warn('Réponse non-JSON reçue pour action:', action, text);
        if (!res.ok) {
          throw new Error(`Erreur serveur (${res.status})`);
        }
        return {};
      }
    }

    if (!res.ok) {
      throw new Error(data.error || `Erreur serveur (${res.status})`);
    }

    return data;
  } catch (err) {
    // Si c'est un logout ignoré ou normal, pas d'affichage d'erreur
    if (action === 'logout') {
      return { ok: true };
    }
    showToast(err.message || 'Erreur de communication', 'error');
    throw err;
  }
}

// Toast Notifications
function showToast(msg, type = 'success') {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast toast-${type}`;
  t.style.display = 'flex';
  clearTimeout(t.timer);
  t.timer = setTimeout(() => { t.style.display = 'none'; }, 3500);
}

// Formatters
const fmtNumber = n => new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
const fmtCurrency = n => `${fmtNumber(n)} ${appCurrency}`;
const fmtDate = d => {
  if (!d) return '-';
  const clean = d.replace(' ', 'T');
  return new Date(clean).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
};

const getStatusBadge = (stock, min = 5) => {
  if (stock <= 2) {
    return `<span class="badge-status st-critique"><span class="dot" style="background:#dc2626"></span>Stock critique</span>`;
  } else if (stock <= min) {
    return `<span class="badge-status st-faible"><span class="dot" style="background:#d97706"></span>Stock faible</span>`;
  }
  return `<span class="badge-status st-dispo"><span class="dot" style="background:#10b981"></span>Disponible</span>`;
};

// ========================================================
// GESTION DES PERMISSIONS & PROFILS UTILISATEUR
// ========================================================
function applyUserPermissions() {
  if (!currentUser) return;

  $('user-display-name').textContent = currentUser.nom;
  const roleBadge = $('user-display-role');
  roleBadge.textContent = currentUser.role;

  // Style spécifique selon rôle
  roleBadge.className = 'role-badge ' + (
    currentUser.role === 'Administrateur' ? 'role-admin' :
    currentUser.role === 'Gestionnaire' ? 'role-gestionnaire' : 'role-user'
  );

  const isAdmin = currentUser.role === 'Administrateur';

  // Verrouillage visuel des sections sensibles
  const navUsers = document.querySelector('nav a[data-tab="utilisateurs"]');
  const navParams = document.querySelector('nav a[data-tab="parametres"]');

  if (navUsers) {
    navUsers.classList.toggle('locked', !isAdmin);
    navUsers.title = isAdmin ? 'Gestion des utilisateurs' : 'Accès réservé aux Administrateurs 🔒';
  }
  if (navParams) {
    navParams.classList.toggle('locked', !isAdmin);
    navParams.title = isAdmin ? 'Paramètres du système' : 'Accès réservé aux Administrateurs 🔒';
  }
}

// ========================================================
// GESTION DE LA NAVIGATION (ONGLETS)
// ========================================================
function switchTab(tabId) {
  // Contrôle d'accès selon le rôle
  if ((tabId === 'utilisateurs' || tabId === 'parametres') && currentUser && currentUser.role !== 'Administrateur') {
    showToast(`Accès restreint : la section "${tabId.toUpperCase()}" est réservée aux Administrateurs 🔒`, 'warning');
    return;
  }

  currentTab = tabId;
  document.querySelectorAll('nav a.nav-item').forEach(el => {
    el.classList.toggle('on', el.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-content').forEach(el => {
    el.classList.toggle('active', el.id === `tab-${tabId}`);
  });

  // Chargement spécifique par onglet
  switch (tabId) {
    case 'dashboard': loadDashboard(); break;
    case 'articles': loadArticles(); break;
    case 'fournisseurs': loadFournisseurs(); break;
    case 'mouvements': loadMouvements(); break;
    case 'inventaire': loadInventaire(); break;
    case 'bureaux': loadBureaux(); break;
    case 'utilisateurs': loadUtilisateurs(); break;
    case 'rapports': loadRapports(); break;
    case 'parametres': loadParametres(); break;
  }
}

// Initialisation des écouteurs de navigation
document.querySelectorAll('nav a.nav-item').forEach(el => {
  el.addEventListener('click', () => switchTab(el.dataset.tab));
});

// ========================================================
// 1. TABLEAU DE BORD
// ========================================================
async function loadDashboard() {
  const d = await api('dashboard');
  if (!d) return;

  $('kA').textContent = d.stats.articles || 0;
  $('kB_units').textContent = fmtNumber(d.stats.total_stock_unites || 0);
  $('kVal').textContent = fmtCurrency(d.stats.valeur_totale || 0);
  $('kC').textContent = fmtNumber(d.stats.entrees || 0);
  $('kD').textContent = fmtNumber(d.stats.sorties || 0);
  $('nb').textContent = d.alertCount || 0;

  // Liste des alertes
  if (!d.alerts || d.alerts.length === 0) {
    $('alerts').innerHTML = `<div class="li" style="color:var(--success);text-align:center;">✅ Aucun article sous le seuil d'alerte</div>`;
  } else {
    $('alerts').innerHTML = d.alerts.map(a => `
      <div class="li">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <b>${a.stock <= 2 ? '🔴 Critique' : '🟠 Faible'} :</b> ${esc(a.designation)}
            <small>${esc(a.reference)} • Lieu : ${esc(a.localisation || 'Non défini')}</small>
            <small><b>${a.stock}</b> unité(s) restante(s) (Seuil min : ${a.stock_min})</small>
          </div>
          <button class="btn btn-sm btn-success" onclick="openMouvementModal(${a.id}, 'entree')" title="Réapprovisionner">＋ Entrée</button>
        </div>
      </div>
    `).join('');
  }

  // Derniers mouvements
  if (!d.mouvements || d.mouvements.length === 0) {
    $('mv').innerHTML = `<div class="li" style="text-align:center;color:var(--muted)">Aucun mouvement récent</div>`;
  } else {
    $('mv').innerHTML = d.mouvements.map(m => `
      <div class="li m">
        <div>
          <span class="${m.type === 'entree' ? 'in' : 'out'}">
            ${m.type === 'entree' ? '🟢 Entrée' : '🟠 Sortie'} (+${m.quantite})
          </span>
          <small>${esc(m.designation)} (${esc(m.reference)})</small>
          <small>Motif : ${esc(m.motif || '-')}</small>
        </div>
        <small style="text-align:right">${fmtDate(m.created_at)}</small>
      </div>
    `).join('');
  }

  // Aperçu rapide du catalogue
  const artSample = await api('articles_list', null, '&page=1&perPage=5');
  if (artSample && artSample.items) {
    $('tb-dash').innerHTML = artSample.items.map(x => `
      <tr>
        <td><b>${esc(x.reference)}</b></td>
        <td>${esc(x.designation)}</td>
        <td><span class="cat-tag">${esc(x.categorie)}</span></td>
        <td><b>${x.stock}</b></td>
        <td>${getStatusBadge(x.stock, x.stock_min)}</td>
        <td>${esc(x.localisation || '-')}</td>
        <td>
          <button class="ic" title="Voir fiche" onclick="viewArticle(${x.id})">👁️</button>
          <button class="ic" title="Modifier" onclick="editArticle(${x.id})">✏️</button>
        </td>
      </tr>
    `).join('');
  }

  // Barres de répartition par catégorie
  if (d.categories && d.categories.length > 0) {
    const maxVal = Math.max(...d.categories.map(c => +c.count), 1);
    $('cat-bars').innerHTML = d.categories.map(c => {
      const pct = Math.round((c.count / maxVal) * 100);
      return `
        <div class="cat-bar-item">
          <div class="cat-bar-labels">
            <span><b>${esc(c.categorie)}</b> (${c.count} réf. — ${c.stock} pièces)</span>
            <span>${fmtCurrency(c.valeur || 0)}</span>
          </div>
          <div class="cat-bar-track">
            <div class="cat-bar-fill" style="width: ${pct}%"></div>
          </div>
        </div>
      `;
    }).join('');
  }
}

// ========================================================
// 2. GESTION DES ARTICLES
// ========================================================
async function loadArticles() {
  const params = `&page=${pageArticles}&q=${encodeURIComponent(queryArticles)}&categorie=${encodeURIComponent(filterCat)}&statut=${encodeURIComponent(filterStatut)}`;
  const d = await api('articles_list', null, params);
  if (!d) return;

  articlesCache = d.items;

  // Mise à jour de la liste déroulante des catégories pour le filtre
  if (d.categories && $('filter-cat').options.length <= 1) {
    d.categories.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      $('filter-cat').appendChild(opt);
    });
  }

  // Alimentation du datalist de localisation
  if (d.localisations) {
    $('list-localisations').innerHTML = d.localisations.map(l => `<option value="${esc(l)}">`).join('');
  }

  if (d.items.length === 0) {
    $('tb').innerHTML = `<tr><td colspan="10" class="loading">Aucun article trouvé</td></tr>`;
  } else {
    $('tb').innerHTML = d.items.map(x => {
      const valTotal = (x.stock * x.prix_unitaire);
      return `
        <tr>
          <td><b>${esc(x.reference)}</b></td>
          <td><b>${esc(x.designation)}</b></td>
          <td><span class="cat-tag">${esc(x.categorie)}</span></td>
          <td><b style="font-size:15px">${x.stock}</b></td>
          <td><span style="color:var(--muted)">min ${x.stock_min}</span></td>
          <td>${fmtCurrency(x.prix_unitaire)}</td>
          <td>${fmtCurrency(valTotal)}</td>
          <td>${esc(x.localisation || '-')}</td>
          <td><small>${esc(x.fournisseur_nom || 'Non défini')}</small></td>
          <td style="text-align:right;white-space:nowrap">
            <button class="ic" title="Voir la fiche détaillée" onclick="viewArticle(${x.id})">👁️</button>
            <button class="ic" title="Entrée de stock" onclick="openMouvementModal(${x.id}, 'entree')">📥</button>
            <button class="ic" title="Sortie de stock" onclick="openMouvementModal(${x.id}, 'sortie')">📤</button>
            <button class="ic" title="Modifier" onclick="editArticle(${x.id})">✏️</button>
            <button class="ic" title="Supprimer" onclick="deleteArticle(${x.id})">🗑️</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Pagination
  const pages = Math.max(1, Math.ceil(d.total / d.perPage));
  const from = d.total ? (pageArticles - 1) * d.perPage + 1 : 0;
  $('info').textContent = `Affichage de ${from} à ${Math.min(pageArticles * d.perPage, d.total)} sur ${d.total} articles`;

  let h = `<button ${pageArticles <= 1 ? 'disabled' : ''} onclick="goPageArticles(${pageArticles - 1})">‹</button>`;
  for (let p = 1; p <= pages; p++) {
    if (p <= 3 || p === pages || Math.abs(p - pageArticles) < 2) {
      h += `<button class="${p === pageArticles ? 'on' : ''}" onclick="goPageArticles(${p})">${p}</button>`;
    } else if (p === 4 && pages > 5) {
      h += '<button disabled>…</button>';
    }
  }
  h += `<button ${pageArticles >= pages ? 'disabled' : ''} onclick="goPageArticles(${pageArticles + 1})">›</button>`;
  $('pg').innerHTML = h;
}

function goPageArticles(p) {
  pageArticles = Math.max(1, p);
  loadArticles();
}

// Recherche & Filtres Articles
let searchTimer;
$('q').oninput = e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    queryArticles = e.target.value.trim();
    pageArticles = 1;
    loadArticles();
  }, 250);
};

$('filter-cat').onchange = e => {
  filterCat = e.target.value;
  pageArticles = 1;
  loadArticles();
};

$('filter-statut').onchange = e => {
  filterStatut = e.target.value;
  pageArticles = 1;
  loadArticles();
};

// Modal Ajout / Modification Article
async function openArticleModal(item = null) {
  editArtId = item ? item.id : null;
  $('dlg-art-title').textContent = item ? `Modifier : ${item.reference}` : 'Nouvel Article / Matériel';
  $('fn').value = item ? item.designation : '';
  $('fc').value = item ? item.categorie : 'Informatique';
  $('fs').value = item ? item.stock : 1;
  $('f-min').value = item ? (item.stock_min || 5) : 5;
  $('f-prix').value = item ? (item.prix_unitaire || 0.00) : 0.00;
  $('fl').value = item ? (item.localisation || '') : 'Bureau 01';

  // Remplissage des fournisseurs
  await refreshSuppliersList();
  const selectFourn = $('f-fournisseur');
  selectFourn.innerHTML = '<option value="">-- Aucun fournisseur associé --</option>' + 
    allSuppliers.map(f => `<option value="${f.id}" ${item && item.fournisseur_id == f.id ? 'selected' : ''}>${esc(f.nom)}</option>`).join('');

  $('dlg-article').showModal();
}

const editArticle = id => {
  const art = articlesCache.find(a => a.id == id);
  if (art) openArticleModal(art);
};

async function deleteArticle(id) {
  if (currentUser && currentUser.role !== 'Administrateur') {
    showToast('Action non autorisée : seuls les Administrateurs peuvent supprimer un article 🔒', 'warning');
    return;
  }
  if (!confirm('Êtes-vous sûr de vouloir supprimer cet article du catalogue ?')) return;
  await api('article_delete', { id });
  showToast('Article supprimé avec succès');
  loadArticles();
  loadDashboard();
}

$('btn-add-article').onclick = () => openArticleModal(null);
$('btn-add-art-dash').onclick = () => openArticleModal(null);
$('qa-add-art').onclick = () => openArticleModal(null);

$('btn-save-art').onclick = async () => {
  const des = $('fn').value.trim();
  if (!des) {
    showToast('Veuillez renseigner la désignation de l\'article', 'warning');
    $('fn').focus();
    return;
  }

  const payload = {
    designation: des,
    categorie: $('fc').value,
    stock: +$('fs').value,
    stock_min: +$('f-min').value,
    prix_unitaire: +$('f-prix').value,
    localisation: $('fl').value.trim(),
    fournisseur_id: $('f-fournisseur').value || null
  };

  try {
    if (editArtId) {
      await api('article_update', { ...payload, id: editArtId });
      showToast('Article mis à jour avec succès');
    } else {
      await api('article_add', payload);
      showToast('Nouvel article créé avec succès');
    }
    $('dlg-article').close();
    loadArticles();
    loadDashboard();
  } catch (e) {
    // Erreur déjà affichée par api()
  }
};

// Consultation détaillée d'un article
async function viewArticle(id) {
  const d = await api('article_get', null, `&id=${id}`);
  if (!d || !d.item) return;

  const item = d.item;
  const valStock = item.stock * item.prix_unitaire;

  let mvsHtml = '<div style="color:var(--muted);font-style:italic">Aucun mouvement enregistré pour cet article</div>';
  if (item.mouvements && item.mouvements.length > 0) {
    mvsHtml = `<div class="wrap"><table style="font-size:12px">
      <thead><tr><th>Date</th><th>Type</th><th>Quantité</th><th>Motif</th></tr></thead>
      <tbody>` +
      item.mouvements.map(m => `
        <tr>
          <td>${fmtDate(m.created_at)}</td>
          <td><span class="${m.type === 'entree' ? 'in' : 'out'}">${m.type === 'entree' ? '🟢 Entrée' : '🟠 Sortie'}</span></td>
          <td><b>${m.quantite}</b></td>
          <td>${esc(m.motif)}</td>
        </tr>
      `).join('') +
      `</tbody></table></div>`;
  }

  $('view-content').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid var(--line);padding-bottom:12px">
      <div>
        <h2 style="margin:0 0 4px">${esc(item.designation)}</h2>
        <span class="cat-tag">${esc(item.categorie)}</span> • Référence : <b>${esc(item.reference)}</b>
      </div>
      <div>${getStatusBadge(item.stock, item.stock_min)}</div>
    </div>

    <div class="art-kpi-row">
      <div class="art-kpi-box">
        <span>Stock Actuel</span>
        <b>${item.stock} unités</b>
      </div>
      <div class="art-kpi-box">
        <span>Seuil Alerte</span>
        <b>${item.stock_min} unités</b>
      </div>
      <div class="art-kpi-box">
        <span>Valeur du stock</span>
        <b>${fmtCurrency(valStock)}</b>
      </div>
    </div>

    <div style="background:var(--head);padding:12px;border-radius:6px;margin-bottom:16px;border:1px solid var(--line)">
      <div style="margin-bottom:6px"><b>📍 Emplacement :</b> ${esc(item.localisation || 'Non assigné')}</div>
      <div style="margin-bottom:6px"><b>🏷️ Prix unitaire d'achat :</b> ${fmtCurrency(item.prix_unitaire)}</div>
      <div><b>🚚 Fournisseur :</b> ${esc(item.fournisseur_nom || 'Aucun fournisseur associé')} 
        ${item.fournisseur_tel ? `(${esc(item.fournisseur_tel)})` : ''}
      </div>
    </div>

    <h4 style="margin:0 0 8px">Historique récent des mouvements :</h4>
    ${mvsHtml}
  `;

  $('btn-view-quick-mouv').onclick = () => {
    $('dlg-view').close();
    openMouvementModal(item.id, 'entree');
  };

  $('dlg-view').showModal();
}

// ========================================================
// 3. GESTION DES MOUVEMENTS (ENTRÉES / SORTIES)
// ========================================================
async function loadMouvements() {
  const params = `&page=${pageMouv}&q=${encodeURIComponent(queryMouv)}&type=${encodeURIComponent(filterMouvType)}`;
  const d = await api('mouvements_list', null, params);
  if (!d) return;

  if (d.items.length === 0) {
    $('tb-mouvements').innerHTML = `<tr><td colspan="7" class="loading">Aucun mouvement trouvé</td></tr>`;
  } else {
    $('tb-mouvements').innerHTML = d.items.map(m => `
      <tr>
        <td>${fmtDate(m.created_at)}</td>
        <td>
          <span class="badge-status ${m.type === 'entree' ? 'st-dispo' : 'st-faible'}">
            ${m.type === 'entree' ? '🟢 ENTRÉE' : '🟠 SORTIE'}
          </span>
        </td>
        <td><b>${esc(m.reference)}</b></td>
        <td>${esc(m.designation)}</td>
        <td><b style="font-size:14px">${m.type === 'entree' ? '+' : '-'}${m.quantite}</b></td>
        <td>${esc(m.motif || '-')}</td>
        <td>${esc(m.localisation || '-')}</td>
      </tr>
    `).join('');
  }

  // Pagination mouvements
  const pages = Math.max(1, Math.ceil(d.total / d.perPage));
  const from = d.total ? (pageMouv - 1) * d.perPage + 1 : 0;
  $('info-mouv').textContent = `Affichage de ${from} à ${Math.min(pageMouv * d.perPage, d.total)} sur ${d.total} mouvements`;

  let h = `<button ${pageMouv <= 1 ? 'disabled' : ''} onclick="goPageMouv(${pageMouv - 1})">‹</button>`;
  for (let p = 1; p <= pages; p++) {
    if (p <= 3 || p === pages || Math.abs(p - pageMouv) < 2) {
      h += `<button class="${p === pageMouv ? 'on' : ''}" onclick="goPageMouv(${p})">${p}</button>`;
    } else if (p === 4 && pages > 5) {
      h += '<button disabled>…</button>';
    }
  }
  h += `<button ${pageMouv >= pages ? 'disabled' : ''} onclick="goPageMouv(${pageMouv + 1})">›</button>`;
  $('pg-mouv').innerHTML = h;
}

function goPageMouv(p) {
  pageMouv = Math.max(1, p);
  loadMouvements();
}

let mouvSearchTimer;
$('q-mouv').oninput = e => {
  clearTimeout(mouvSearchTimer);
  mouvSearchTimer = setTimeout(() => {
    queryMouv = e.target.value.trim();
    pageMouv = 1;
    loadMouvements();
  }, 250);
};

$('filter-mouv-type').onchange = e => {
  filterMouvType = e.target.value;
  pageMouv = 1;
  loadMouvements();
};

// Modal de Mouvement
async function openMouvementModal(preselectedArticleId = null, preselectedType = 'entree') {
  // Chargement de la liste complète des articles pour la sélection
  const res = await api('articles_list', null, '&page=1&perPage=500');
  const articles = res.items || [];

  $('dlg-mouv-title').textContent = preselectedType === 'entree' ? '📥 Nouvelle Entrée en stock' : '📤 Nouvelle Sortie de stock';
  $('mouv-type').value = preselectedType;
  $('mouv-qte').value = 1;
  $('mouv-motif').value = preselectedType === 'entree' ? 'Réception marchandise' : 'Attribution de matériel';

  const select = $('mouv-article');
  select.innerHTML = '<option value="">-- Choisissez un article --</option>' +
    articles.map(a => `<option value="${a.id}" data-stock="${a.stock}" ${a.id == preselectedArticleId ? 'selected' : ''}>${esc(a.reference)} — ${esc(a.designation)} (Stock: ${a.stock})</option>`).join('');

  const updateInfo = () => {
    const opt = select.options[select.selectedIndex];
    if (opt && opt.value) {
      const stock = opt.dataset.stock;
      $('mouv-current-info').style.display = 'block';
      $('mouv-current-info').innerHTML = `📦 <b>Stock actuel disponible :</b> ${stock} unité(s)`;
    } else {
      $('mouv-current-info').style.display = 'none';
    }
  };

  select.onchange = updateInfo;
  updateInfo();

  $('dlg-mouvement').showModal();
}

$('mouv-type').onchange = e => {
  const type = e.target.value;
  $('dlg-mouv-title').textContent = type === 'entree' ? '📥 Nouvelle Entrée en stock' : '📤 Nouvelle Sortie de stock';
  if (!$('mouv-motif').value || $('mouv-motif').value.includes('Attribution') || $('mouv-motif').value.includes('Réception')) {
    $('mouv-motif').value = type === 'entree' ? 'Réception marchandise' : 'Attribution de matériel';
  }
};

$('btn-mouv-entree').onclick = () => openMouvementModal(null, 'entree');
$('btn-mouv-sortie').onclick = () => openMouvementModal(null, 'sortie');
$('qa-entree').onclick = () => openMouvementModal(null, 'entree');
$('qa-sortie').onclick = () => openMouvementModal(null, 'sortie');

$('btn-submit-mouv').onclick = async () => {
  const artId = +$('mouv-article').value;
  const type = $('mouv-type').value;
  const qte = +$('mouv-qte').value;
  const motif = $('mouv-motif').value.trim();

  if (!artId) {
    showToast('Veuillez sélectionner un article', 'warning');
    return;
  }
  if (qte <= 0) {
    showToast('La quantité doit être supérieure à 0', 'warning');
    return;
  }

  try {
    const res = await api('mouvement_add', { article_id: artId, type, quantite: qte, motif });
    showToast(`Mouvement enregistré ! Nouveau stock : ${res.new_stock} unités`);
    $('dlg-mouvement').close();
    loadMouvements();
    loadDashboard();
    if (currentTab === 'articles') loadArticles();
  } catch (e) {
    // Erreur déjà affichée
  }
};

// ========================================================
// 4. GESTION DES FOURNISSEURS
// ========================================================
async function refreshSuppliersList() {
  const d = await api('fournisseurs_list');
  allSuppliers = d.items || [];
}

async function loadFournisseurs() {
  await refreshSuppliersList();
  if (allSuppliers.length === 0) {
    $('tb-fournisseurs').innerHTML = `<tr><td colspan="8" class="loading">Aucun fournisseur enregistré</td></tr>`;
  } else {
    $('tb-fournisseurs').innerHTML = allSuppliers.map(f => `
      <tr>
        <td><b>${esc(f.nom)}</b></td>
        <td>${esc(f.contact || '-')}</td>
        <td>${f.email ? `<a href="mailto:${esc(f.email)}" class="link-sm">✉️ ${esc(f.email)}</a>` : '-'}</td>
        <td>${f.telephone ? `<a href="tel:${esc(f.telephone)}" class="link-sm">📞 ${esc(f.telephone)}</a>` : '-'}</td>
        <td><small>${esc(f.adresse || '-')}</small></td>
        <td><span class="cat-tag">${f.articles_count} article(s)</span></td>
        <td><b>${f.total_stock || 0} pièces</b></td>
        <td style="text-align:right">
          <button class="ic" title="Modifier" onclick="editFournisseur(${f.id})">✏️</button>
          <button class="ic" title="Supprimer" onclick="deleteFournisseur(${f.id})">🗑️</button>
        </td>
      </tr>
    `).join('');
  }
}

function openFournisseurModal(item = null) {
  editFournId = item ? item.id : null;
  $('dlg-fourn-title').textContent = item ? `Modifier le fournisseur` : 'Nouveau Fournisseur';
  $('fourn-nom').value = item ? item.nom : '';
  $('fourn-contact').value = item ? item.contact : '';
  $('fourn-email').value = item ? item.email : '';
  $('fourn-tel').value = item ? item.telephone : '';
  $('fourn-adresse').value = item ? item.adresse : '';
  $('dlg-fournisseur').showModal();
}

const editFournisseur = id => {
  const f = allSuppliers.find(x => x.id == id);
  if (f) openFournisseurModal(f);
};

async function deleteFournisseur(id) {
  if (currentUser && currentUser.role !== 'Administrateur') {
    showToast('Action non autorisée : seuls les Administrateurs peuvent supprimer un fournisseur 🔒', 'warning');
    return;
  }
  if (!confirm('Supprimer ce fournisseur ?')) return;
  await api('fournisseur_delete', { id });
  showToast('Fournisseur supprimé');
  loadFournisseurs();
}

$('btn-add-fournisseur').onclick = () => openFournisseurModal(null);
$('btn-save-fourn').onclick = async () => {
  const nom = $('fourn-nom').value.trim();
  if (!nom) {
    showToast('Le nom du fournisseur est obligatoire', 'warning');
    return;
  }
  const payload = {
    nom,
    contact: $('fourn-contact').value.trim(),
    email: $('fourn-email').value.trim(),
    telephone: $('fourn-tel').value.trim(),
    adresse: $('fourn-adresse').value.trim()
  };
  if (editFournId) {
    await api('fournisseur_update', { ...payload, id: editFournId });
    showToast('Fournisseur mis à jour');
  } else {
    await api('fournisseur_add', payload);
    showToast('Fournisseur ajouté avec succès');
  }
  $('dlg-fournisseur').close();
  loadFournisseurs();
};

// ========================================================
// 5. INVENTAIRE PHYSIQUE & RÉCONCILIATION
// ========================================================
async function loadInventaire() {
  const d = await api('inventaire_list');
  if (!d || !d.items) return;

  if (d.items.length === 0) {
    $('tb-inventaire').innerHTML = `<tr><td colspan="8" class="loading">Aucun article dans l'inventaire</td></tr>`;
  } else {
    $('tb-inventaire').innerHTML = d.items.map(item => `
      <tr id="inv-row-${item.id}">
        <td><b>${esc(item.reference)}</b></td>
        <td>${esc(item.designation)}</td>
        <td><span class="cat-tag">${esc(item.categorie)}</span></td>
        <td>${esc(item.localisation || '-')}</td>
        <td><b id="inv-theo-${item.id}">${item.stock}</b></td>
        <td>
          <input type="number" min="0" value="${item.stock}" class="inv-input" id="inv-reel-${item.id}" oninput="calcInvDiff(${item.id})">
        </td>
        <td><span id="inv-diff-${item.id}" class="diff-tag diff-zero">0</span></td>
        <td>
          <button class="btn btn-sm btn-primary" onclick="applyInvAdjustment(${item.id})">Ajuster</button>
        </td>
      </tr>
    `).join('');
  }
}

function calcInvDiff(id) {
  const theo = +$(`inv-theo-${id}`).textContent;
  const reel = +$(`inv-reel-${id}`).value;
  const diff = reel - theo;
  const badge = $(`inv-diff-${id}`);
  
  if (diff === 0) {
    badge.className = 'diff-tag diff-zero';
    badge.textContent = '0 (Conforme)';
  } else if (diff > 0) {
    badge.className = 'diff-tag diff-pos';
    badge.textContent = `+${diff} (Excédent)`;
  } else {
    badge.className = 'diff-tag diff-neg';
    badge.textContent = `${diff} (Manquant)`;
  }
}

async function applyInvAdjustment(id) {
  const reel = +$(`inv-reel-${id}`).value;
  if (reel < 0) {
    showToast('Le stock ne peut pas être négatif', 'warning');
    return;
  }
  try {
    const res = await api('inventaire_ajuster', { id, stock_reel: reel });
    showToast(`Inventaire réconcilié pour l'article ! Différence : ${res.difference}`);
    $(`inv-theo-${id}`).textContent = reel;
    calcInvDiff(id);
    loadDashboard();
  } catch (e) {
    // Erreur gérée
  }
}

$('btn-refresh-inventaire').onclick = loadInventaire;

// ========================================================
// 6. GESTION DES BUREAUX & SERVICES
// ========================================================
async function loadBureaux() {
  const d = await api('bureaux_list');
  allOffices = d.items || [];

  if (allOffices.length === 0) {
    $('tb-bureaux').innerHTML = `<tr><td colspan="7" class="loading">Aucun bureau enregistré</td></tr>`;
  } else {
    $('tb-bureaux').innerHTML = allOffices.map(b => `
      <tr>
        <td><b>📍 ${esc(b.nom)}</b></td>
        <td>${esc(b.batiment || '-')}</td>
        <td>${esc(b.etage || '-')}</td>
        <td>👤 ${esc(b.responsable || 'Non assigné')}</td>
        <td><span class="cat-tag">${b.articles_count} type(s) d'articles</span></td>
        <td><b>${b.total_stock || 0} unités</b></td>
        <td style="text-align:right">
          <button class="ic" title="Modifier" onclick="editBureau(${b.id})">✏️</button>
          <button class="ic" title="Supprimer" onclick="deleteBureau(${b.id})">🗑️</button>
        </td>
      </tr>
    `).join('');
  }
}

function openBureauModal(item = null) {
  editBureauId = item ? item.id : null;
  $('dlg-bureau-title').textContent = item ? `Modifier le lieu` : 'Nouveau Bureau / Salle';
  $('bureau-nom').value = item ? item.nom : '';
  $('bureau-bat').value = item ? item.batiment : '';
  $('bureau-etage').value = item ? item.etage : '';
  $('bureau-resp').value = item ? item.responsable : '';
  $('dlg-bureau').showModal();
}

const editBureau = id => {
  const b = allOffices.find(x => x.id == id);
  if (b) openBureauModal(b);
};

async function deleteBureau(id) {
  if (currentUser && currentUser.role !== 'Administrateur') {
    showToast('Action non autorisée : seuls les Administrateurs peuvent supprimer un lieu 🔒', 'warning');
    return;
  }
  if (!confirm('Supprimer cet emplacement ?')) return;
  await api('bureau_delete', { id });
  showToast('Emplacement supprimé');
  loadBureaux();
}

$('btn-add-bureau').onclick = () => openBureauModal(null);
$('btn-save-bureau').onclick = async () => {
  const nom = $('bureau-nom').value.trim();
  if (!nom) {
    showToast('Le nom de la salle/bureau est obligatoire', 'warning');
    return;
  }
  const payload = {
    nom,
    batiment: $('bureau-bat').value.trim(),
    etage: $('bureau-etage').value.trim(),
    responsable: $('bureau-resp').value.trim()
  };
  if (editBureauId) {
    await api('bureau_update', { ...payload, id: editBureauId });
    showToast('Lieu mis à jour');
  } else {
    await api('bureau_add', payload);
    showToast('Lieu créé avec succès');
  }
  $('dlg-bureau').close();
  loadBureaux();
};

// ========================================================
// 7. GESTION DES UTILISATEURS
// ========================================================
async function loadUtilisateurs() {
  const d = await api('utilisateurs_list');
  const users = d.items || [];

  if (users.length === 0) {
    $('tb-utilisateurs').innerHTML = `<tr><td colspan="6" class="loading">Aucun utilisateur enregistré</td></tr>`;
  } else {
    $('tb-utilisateurs').innerHTML = users.map(u => `
      <tr>
        <td><b>👤 ${esc(u.nom)}</b></td>
        <td><a href="mailto:${esc(u.email)}" class="link-sm">${esc(u.email)}</a></td>
        <td><span class="role-badge">${esc(u.role)}</span></td>
        <td>
          <span class="badge-status ${u.statut === 'Actif' ? 'st-dispo' : 'st-critique'}">
            ${esc(u.statut)}
          </span>
        </td>
        <td>${fmtDate(u.created_at)}</td>
        <td style="text-align:right">
          <button class="ic" title="Modifier" onclick="editUtilisateur(${u.id})">✏️</button>
          <button class="ic" title="Supprimer" onclick="deleteUtilisateur(${u.id})">🗑️</button>
        </td>
      </tr>
    `).join('');
  }
}

function openUtilisateurModal(item = null) {
  editUserId = item ? item.id : null;
  $('dlg-user-title').textContent = item ? `Modifier l'utilisateur` : 'Nouvel Utilisateur';
  $('user-nom').value = item ? item.nom : '';
  $('user-email').value = item ? item.email : '';
  $('user-role').value = item ? item.role : 'Gestionnaire';
  $('user-statut').value = item ? item.statut : 'Actif';
  $('user-pwd').value = '';
  $('user-pwd-hint').textContent = item ? '(laisser vide pour ne pas modifier)' : '(par défaut : user123)';
  $('dlg-utilisateur').showModal();
}

const editUtilisateur = async id => {
  const d = await api('utilisateurs_list');
  const u = (d.items || []).find(x => x.id == id);
  if (u) openUtilisateurModal(u);
};

async function deleteUtilisateur(id) {
  if (currentUser && currentUser.role !== 'Administrateur') {
    showToast('Action non autorisée : seuls les Administrateurs peuvent supprimer un utilisateur 🔒', 'warning');
    return;
  }
  if (currentUser && currentUser.id == id) {
    showToast('Vous ne pouvez pas supprimer le compte actuellement connecté !', 'warning');
    return;
  }
  if (!confirm('Supprimer cet utilisateur ?')) return;
  await api('utilisateur_delete', { id });
  showToast('Utilisateur supprimé');
  loadUtilisateurs();
}

$('btn-add-utilisateur').onclick = () => openUtilisateurModal(null);
$('btn-save-user').onclick = async () => {
  const nom = $('user-nom').value.trim();
  const email = $('user-email').value.trim();
  const pwd = $('user-pwd').value.trim();
  if (!nom || !email) {
    showToast('Nom et email sont requis', 'warning');
    return;
  }
  const payload = {
    nom,
    email,
    role: $('user-role').value,
    statut: $('user-statut').value
  };
  if (pwd) {
    payload.mot_de_passe = pwd;
  }
  if (editUserId) {
    await api('utilisateur_update', { ...payload, id: editUserId });
    showToast('Utilisateur mis à jour');
  } else {
    await api('utilisateur_add', payload);
    showToast('Utilisateur créé avec succès');
  }
  $('dlg-utilisateur').close();
  loadUtilisateurs();
};

// ========================================================
// 8. RAPPORTS & ANALYTIQUE
// ========================================================
async function loadRapports() {
  const d = await api('rapports');
  if (!d) return;

  $('rep-total-ref').textContent = d.totaux.nb_articles || 0;
  $('rep-total-unites').textContent = fmtNumber(d.totaux.total_unites || 0);
  $('rep-total-val').textContent = fmtCurrency(d.totaux.total_valeur || 0);
  $('rep-alert-count').textContent = d.totaux.alertes_count || 0;

  // Par catégorie
  $('rep-tb-cat').innerHTML = (d.par_categorie || []).map(c => `
    <tr>
      <td><b>${esc(c.categorie)}</b></td>
      <td>${c.count}</td>
      <td>${fmtNumber(c.stock)}</td>
      <td><b>${fmtCurrency(c.valeur)}</b></td>
    </tr>
  `).join('');

  // Top sorties
  if (!d.top_sorties || d.top_sorties.length === 0) {
    $('rep-tb-sorties').innerHTML = `<tr><td colspan="3" class="loading">Aucune sortie enregistrée</td></tr>`;
  } else {
    $('rep-tb-sorties').innerHTML = d.top_sorties.map(s => `
      <tr>
        <td><b>${esc(s.reference)}</b></td>
        <td>${esc(s.designation)}</td>
        <td><b class="out">-${s.total_sorti} unités</b></td>
      </tr>
    `).join('');
  }

  // Par localisation
  $('rep-tb-loc').innerHTML = (d.par_localisation || []).map(l => `
    <tr>
      <td><b>📍 ${esc(l.localisation)}</b></td>
      <td>${l.count} références</td>
      <td><b>${fmtNumber(l.stock)} pièces</b></td>
    </tr>
  `).join('');
}

// ========================================================
// 9. CONFIGURATION & PARAMÈTRES
// ========================================================
async function loadParametres() {
  const d = await api('parametres_get');
  if (!d || !d.parametres) return;

  const p = d.parametres;
  if (p.nom_entreprise) {
    $('cfg-nom').value = p.nom_entreprise;
    $('app-title').textContent = p.nom_entreprise;
  }
  if (p.devise) {
    $('cfg-devise').value = p.devise;
    appCurrency = p.devise;
  }
  if (p.email_notification) $('cfg-email').value = p.email_notification;
  if (p.seuil_alerte) $('cfg-seuil-alerte').value = p.seuil_alerte;
  if (p.seuil_critique) $('cfg-seuil-critique').value = p.seuil_critique;
}

$('btn-save-params').onclick = async () => {
  const params = {
    nom_entreprise: $('cfg-nom').value.trim(),
    devise: $('cfg-devise').value.trim() || '€',
    email_notification: $('cfg-email').value.trim(),
    seuil_alerte: $('cfg-seuil-alerte').value,
    seuil_critique: $('cfg-seuil-critique').value
  };

  await api('parametres_save', { parametres: params });
  appCurrency = params.devise;
  if (params.nom_entreprise) $('app-title').textContent = params.nom_entreprise;
  showToast('Paramètres enregistrés avec succès !');
  loadDashboard();
};

// ========================================================
// EXPORTS CSV
// ========================================================
$('btn-export-articles').onclick = () => window.open('api.php?action=export_csv&export=articles');
$('btn-export-mouvements').onclick = () => window.open('api.php?action=export_csv&export=mouvements');

// ========================================================
// AUTHENTIFICATION & GESTION DE SESSION
// ========================================================
async function handleLogin(email, password) {
  const errBox = $('login-error');
  errBox.style.display = 'none';

  if (!email || !password) {
    errBox.textContent = 'Veuillez saisir votre email et votre mot de passe.';
    errBox.style.display = 'block';
    return;
  }

  const btn = $('btn-submit-login');
  const origText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Connexion en cours…';

  try {
    const res = await api('login', { email, password });
    if (res && res.user) {
      currentUser = res.user;
      $('login-screen').style.display = 'none';
      applyUserPermissions();
      showToast(`Connexion réussie ! Bienvenue, ${currentUser.nom}`, 'success');

      // Chargement des données de l'application
      await loadParametres();
      await loadDashboard();
      $('dbs').textContent = 'Connectée';
      $('dbs').className = 'ok';
    }
  } catch (err) {
    errBox.textContent = err.message || 'Identifiants invalides';
    errBox.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = origText;
  }
}

// Boutons de connexion rapide
if ($('btn-quick-admin')) {
  $('btn-quick-admin').onclick = () => {
    $('login-email').value = 'admin@entreprise.com';
    $('login-pwd').value = 'admin123';
    handleLogin('admin@entreprise.com', 'admin123');
  };
}

if ($('btn-quick-user')) {
  $('btn-quick-user').onclick = () => {
    $('login-email').value = 'julie.magasin@entreprise.com';
    $('login-pwd').value = 'user123';
    handleLogin('julie.magasin@entreprise.com', 'user123');
  };
}

$('form-login').onsubmit = (e) => {
  e.preventDefault();
  handleLogin($('login-email').value.trim(), $('login-pwd').value);
};

// Afficher / Masquer mot de passe
$('btn-toggle-pwd').onclick = () => {
  const pwdInput = $('login-pwd');
  pwdInput.type = pwdInput.type === 'password' ? 'text' : 'password';
};

// Déconnexion
$('btn-logout').onclick = async () => {
  try {
    await api('logout');
  } catch (e) {}
  currentUser = null;
  $('login-screen').style.display = 'flex';
  $('login-email').value = '';
  $('login-pwd').value = '';
  $('login-error').style.display = 'none';
  showToast('Vous avez été déconnecté avec succès.', 'success');
};

// ========================================================
// INITIALISATION AU DÉMARRAGE
// ========================================================
$('date').textContent = '📅 ' + new Date().toLocaleDateString('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric'
});

async function initApp() {
  try {
    const auth = await api('auth_check');
    if (auth && auth.authenticated && auth.user) {
      currentUser = auth.user;
      $('login-screen').style.display = 'none';
      applyUserPermissions();
      await loadParametres();
      await loadDashboard();
      $('dbs').textContent = 'Connectée';
      $('dbs').className = 'ok';
    } else {
      currentUser = null;
      $('login-screen').style.display = 'flex';
      $('dbs').textContent = 'En attente de connexion';
      $('dbs').className = '';
    }
  } catch (err) {
    currentUser = null;
    $('login-screen').style.display = 'flex';
    $('dbs').textContent = 'Erreur';
    $('dbs').className = 'ko';
  }
}

initApp();

