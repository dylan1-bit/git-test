const $ = (selector) => document.querySelector(selector);
const input = $('#photoInput');
const dropZone = $('#dropZone');
const gallery = $('#gallery');
const canvas = $('#previewCanvas');
const ctx = canvas.getContext('2d');
let photos = [];
let selectedIndex = -1;
let musicFile = null;
let voiceBlob = null;
let recorder = null;
let voiceChunks = [];
let recordingTimer;
let previewTimer;
let playing = false;
let lastVideo = null;

$('#browseButton').addEventListener('click', (event) => { event.stopPropagation(); input.click(); });
dropZone.addEventListener('click', (event) => { if (event.target !== $('#browseButton')) input.click(); });
dropZone.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') input.click(); });
input.addEventListener('change', (event) => addPhotos(event.target.files));
['dragenter', 'dragover'].forEach((name) => dropZone.addEventListener(name, (event) => { event.preventDefault(); dropZone.classList.add('dragging'); }));
['dragleave', 'drop'].forEach((name) => dropZone.addEventListener(name, (event) => { event.preventDefault(); dropZone.classList.remove('dragging'); }));
dropZone.addEventListener('drop', (event) => addPhotos(event.dataTransfer.files));
$('#projectName').addEventListener('input', updateProject);
$('#sceneCaption').addEventListener('input', () => { if (photos[selectedIndex]) { photos[selectedIndex].caption = $('#sceneCaption').value; drawScene(photos[selectedIndex], selectedIndex, 0); } });
$('#collageSelect').addEventListener('change', () => drawScene(photos[selectedIndex], selectedIndex, 0));
$('#durationSelect').addEventListener('change', updateMeta);
$('#musicButton').addEventListener('click', () => $('#musicInput').click());
$('#musicInput').addEventListener('change', (event) => { musicFile = event.target.files[0] || null; $('#musicName').textContent = musicFile ? musicFile.name : 'Aucune musique ajoutée'; showToast(musicFile ? 'Chanson ajoutée.' : 'Chanson retirée.'); });
$('#voiceButton').addEventListener('click', startVoiceRecording);
$('#stopVoice').addEventListener('click', stopVoiceRecording);
$('#playButton').addEventListener('click', togglePreview);
$('#exportButton').addEventListener('click', exportVideo);
$('#shareButton').addEventListener('click', shareVideo);
$('#newProject').addEventListener('click', resetProject);
$('#saveProject').addEventListener('click', () => { localStorage.setItem('crees-un-souvenir-project', JSON.stringify({ name: $('#projectName').value, note: $('#projectNote').value, count: photos.length })); showToast('Projet enregistré sur cet appareil.'); });

function addPhotos(fileList) {
  const files = [...fileList].filter((file) => file.type.startsWith('image/')).slice(0, 20 - photos.length);
  files.forEach((file) => photos.push({ url: URL.createObjectURL(file), caption: '' }));
  if (files.length) { if (selectedIndex < 0) selectedIndex = 0; showToast(`${files.length} scène${files.length > 1 ? 's' : ''} ajoutée${files.length > 1 ? 's' : ''}.`); }
  input.value = '';
  renderGallery();
}
function renderGallery() {
  gallery.innerHTML = '';
  photos.forEach((photo, index) => {
    const item = document.createElement('article');
    item.className = `photo${index === selectedIndex ? ' selected' : ''}`;
    item.innerHTML = `<img src="${photo.url}" alt="Scène ${index + 1}"><button class="remove-photo" type="button" aria-label="Supprimer la scène ${index + 1}">×</button>`;
    item.addEventListener('click', () => selectScene(index));
    item.querySelector('button').addEventListener('click', (event) => { event.stopPropagation(); URL.revokeObjectURL(photo.url); photos.splice(index, 1); selectedIndex = Math.min(selectedIndex, photos.length - 1); renderGallery(); });
    gallery.appendChild(item);
  });
  const label = `${photos.length} scène${photos.length !== 1 ? 's' : ''}`;
  $('#sceneCount').textContent = label;
  $('#emptyState').hidden = photos.length > 0;
  $('#previewEmpty').hidden = photos.length > 0;
  updateMeta();
  if (photos.length) selectScene(Math.max(0, selectedIndex)); else { $('#sceneEditor').hidden = true; clearCanvas(); }
}
function selectScene(index) {
  if (!photos[index]) return;
  selectedIndex = index;
  $('#sceneEditor').hidden = false;
  $('#sceneLabel').textContent = `Scène ${index + 1}`;
  $('#scenePosition').textContent = `${index + 1} / ${photos.length}`;
  $('#sceneCaption').value = photos[index].caption;
  [...gallery.children].forEach((item, itemIndex) => item.classList.toggle('selected', itemIndex === selectedIndex));
  drawScene(photos[index], index, 0);
}
function updateProject() { $('#summaryName').textContent = $('#projectName').value.trim() || 'Ton souvenir'; }
function updateMeta() { const seconds = photos.length * Number($('#durationSelect').value); $('#summaryMeta').textContent = `${photos.length} scène${photos.length !== 1 ? 's' : ''} · 0:${String(seconds).padStart(2, '0')}`; updateProject(); }
function clearCanvas() { ctx.fillStyle = '#f7f4ef'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
function loadImage(photo) { return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = photo.url; }); }
function drawContained(image, x, y, width, height, padding = 0) { const boxWidth = width - padding * 2; const boxHeight = height - padding * 2; const scale = Math.min(boxWidth / image.width, boxHeight / image.height); const imageWidth = image.width * scale; const imageHeight = image.height * scale; ctx.drawImage(image, x + padding + (boxWidth - imageWidth) / 2, y + padding + (boxHeight - imageHeight) / 2, imageWidth, imageHeight); }
function roundClip(x, y, width, height, radius) { ctx.beginPath(); ctx.moveTo(x + radius, y); ctx.arcTo(x + width, y, x + width, y + height, radius); ctx.arcTo(x + width, y + height, x, y + height, radius); ctx.arcTo(x, y + height, x, y, radius); ctx.arcTo(x, y, x + width, y, radius); ctx.closePath(); ctx.clip(); }
async function drawScene(photo, index, progress) {
  if (!photo) return clearCanvas();
  const image = await loadImage(photo);
  clearCanvas();
  const layout = $('#collageSelect').value;
  if (layout === 'mosaic') await drawMosaic(image, index);
  else if (layout === 'filmstrip') await drawFilmstrip(image, index);
  else if (layout === 'stack') await drawStack(image, index);
  else drawFocus(image);
  drawCaption(photo.caption, index);
}
function drawFocus(image) { ctx.fillStyle = '#fffdfa'; ctx.fillRect(28, 28, canvas.width - 56, canvas.height - 56); drawContained(image, 28, 28, canvas.width - 56, canvas.height - 56, 24); }
async function drawMosaic(image, index) { const cells = [image]; for (let offset = 1; offset < 4; offset += 1) if (photos[index + offset]) cells.push(await loadImage(photos[index + offset])); const gap = 12; const size = (canvas.width - gap * 3) / 2; cells.forEach((cell, cellIndex) => { const x = gap + (cellIndex % 2) * (size + gap); const y = gap + Math.floor(cellIndex / 2) * (size + gap); ctx.save(); roundClip(x, y, size, size, 18); ctx.fillStyle = '#fffdfa'; ctx.fillRect(x, y, size, size); drawContained(cell, x, y, size, size, 12); ctx.restore(); }); }
async function drawFilmstrip(image, index) { const cards = [image]; if (photos[index + 1]) cards.push(await loadImage(photos[index + 1])); if (photos[index + 2]) cards.push(await loadImage(photos[index + 2])); const cardWidth = 214; const cardHeight = 500; const positions = [{ x: 18, y: 110, rotate: -.08 }, { x: 253, y: 58, rotate: 0 }, { x: 488, y: 110, rotate: .08 }]; cards.forEach((card, cardIndex) => { const position = positions[cardIndex]; ctx.save(); ctx.translate(position.x + cardWidth / 2, position.y + cardHeight / 2); ctx.rotate(position.rotate); ctx.translate(-cardWidth / 2, -cardHeight / 2); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cardWidth, cardHeight); drawContained(card, 10, 10, cardWidth - 20, cardHeight - 62, 5); ctx.fillStyle = '#d4c9bd'; ctx.fillRect(26, cardHeight - 33, cardWidth - 52, 2); ctx.restore(); }); }
async function drawStack(image, index) { const cards = [image]; if (photos[index + 1]) cards.push(await loadImage(photos[index + 1])); if (photos[index + 2]) cards.push(await loadImage(photos[index + 2])); const positions = [{ x: 100, y: 88, rotate: -.08 }, { x: 150, y: 58, rotate: .04 }, { x: 200, y: 28, rotate: .11 }]; cards.forEach((card, cardIndex) => { const position = positions[cardIndex]; ctx.save(); ctx.translate(canvas.width / 2, canvas.height / 2); ctx.rotate(position.rotate); ctx.translate(-260 + (position.x - 100), -280 + (position.y - 88)); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 520, 560); drawContained(card, 20, 20, 480, 480, 12); ctx.restore(); }); }
function drawCaption(caption, index) { if (!caption) return; ctx.fillStyle = 'rgba(32,53,46,.78)'; ctx.fillRect(0, canvas.height - 118, canvas.width, 118); ctx.fillStyle = '#fff'; ctx.font = '700 32px Manrope, sans-serif'; ctx.fillText(caption, 30, canvas.height - 52, canvas.width - 60); ctx.fillStyle = '#f0c2aa'; ctx.font = '600 13px DM Sans, sans-serif'; ctx.fillText(`SCÈNE ${String(index + 1).padStart(2, '0')}`, 32, canvas.height - 25); }

async function togglePreview() { if (!photos.length) return showToast('Ajoute au moins une photo pour lire le film.'); if (playing) return stopPreview(); playing = true; $('#playButton').textContent = 'Ⅱ'; $('#previewStatus').textContent = 'Lecture en cours'; let index = 0; const duration = Number($('#durationSelect').value) * 1000; const next = async () => { if (!playing) return; await drawScene(photos[index], index, 0); index = (index + 1) % photos.length; previewTimer = setTimeout(next, duration); }; next(); }
function stopPreview() { playing = false; clearTimeout(previewTimer); $('#playButton').textContent = '▶'; $('#previewStatus').textContent = 'Prête à être créée'; }
async function startVoiceRecording() { if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return showToast('Le micro n’est pas disponible dans ce navigateur.'); try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); voiceChunks = []; recorder = new MediaRecorder(stream); recorder.ondataavailable = (event) => voiceChunks.push(event.data); recorder.onstop = () => { voiceBlob = new Blob(voiceChunks, { type: recorder.mimeType || 'audio/webm' }); stream.getTracks().forEach((track) => track.stop()); $('#voiceStatus').textContent = 'Voix off prête'; showToast('Voix off enregistrée.'); }; recorder.start(); $('#voiceButton').disabled = true; $('#recordingBar').hidden = false; const started = Date.now(); recordingTimer = setInterval(() => { const seconds = Math.floor((Date.now() - started) / 1000); $('#recordingTime').textContent = `00:${String(seconds).padStart(2, '0')}`; }, 500); } catch { showToast('Autorise le micro pour enregistrer ta voix.'); } }
function stopVoiceRecording() { if (!recorder) return; recorder.stop(); clearInterval(recordingTimer); $('#recordingBar').hidden = true; $('#voiceButton').disabled = false; }
async function exportVideo() { if (!photos.length) return showToast('Ajoute au moins une photo avant de créer la vidéo.'); if (!canvas.captureStream || !window.MediaRecorder) return showToast('L’export nécessite un navigateur récent.'); stopPreview(); const button = $('#exportButton'); button.disabled = true; $('#previewStatus').textContent = 'Création en cours...'; const stream = canvas.captureStream(30); let audioContext; try { const audio = await makeAudioTrack(); audioContext = audio.context; if (audio.track) stream.addTrack(audio.track); } catch { /* La vidéo reste exportable sans audio. */ } const type = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus' : 'video/webm'; const chunks = []; const videoRecorder = new MediaRecorder(stream, { mimeType: type }); videoRecorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); }; const done = new Promise((resolve) => { videoRecorder.onstop = () => resolve(new Blob(chunks, { type })); }); videoRecorder.start(); await renderFilm(); videoRecorder.stop(); lastVideo = await done; audioContext?.close(); download(lastVideo, `${fileName()}.webm`); button.disabled = false; $('#previewStatus').textContent = 'Vidéo prête'; showToast('Vidéo téléchargée sur ton appareil.'); }
async function renderFilm() { const duration = Number($('#durationSelect').value) * 1000; for (let index = 0; index < photos.length; index += 1) { const start = performance.now(); while (performance.now() - start < duration) { await drawScene(photos[index], index, (performance.now() - start) / duration); await new Promise((resolve) => requestAnimationFrame(resolve)); } } }
async function makeAudioTrack() { const files = [musicFile, voiceBlob].filter(Boolean); if (!files.length) return { track: null, context: null }; const context = new AudioContext(); const destination = context.createMediaStreamDestination(); const mixer = context.createGain(); mixer.gain.value = .9; mixer.connect(destination); for (const file of files) { const buffer = await context.decodeAudioData(await file.arrayBuffer()); const source = context.createBufferSource(); source.buffer = buffer; source.connect(mixer); source.start(0); } return { track: destination.stream.getAudioTracks()[0], context }; }
function download(blob, name) { const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); }
async function shareVideo() { if (!lastVideo) await exportVideo(); if (!lastVideo) return; const file = new File([lastVideo], `${fileName()}.webm`, { type: 'video/webm' }); if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) { try { await navigator.share({ title: $('#projectName').value, text: 'Un souvenir à partager', files: [file] }); return; } catch (error) { if (error.name === 'AbortError') return; } } window.open(`https://wa.me/?text=${encodeURIComponent(`Voici mon souvenir « ${$('#projectName').value} »`)}`, '_blank'); showToast('WhatsApp est ouvert. La vidéo est dans tes téléchargements.'); }
function fileName() { return ($('#projectName').value.trim() || 'mon-souvenir').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase(); }
function resetProject() { if (!confirm('Recommencer ce projet et supprimer les photos ?')) return; photos.forEach((photo) => URL.revokeObjectURL(photo.url)); photos = []; selectedIndex = -1; musicFile = null; voiceBlob = null; $('#projectName').value = 'Les petits bonheurs'; $('#projectNote').value = ''; $('#musicName').textContent = 'Aucune musique ajoutée'; $('#voiceStatus').textContent = 'Explique chaque moment'; renderGallery(); showToast('Un nouveau projet est prêt.'); }
function showToast(message) { const toast = $('#toast'); toast.textContent = message; toast.classList.add('visible'); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove('visible'), 3000); }
renderGallery();
