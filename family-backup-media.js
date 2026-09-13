(() => {
  const MAX_BYTES = 50 * 1024 * 1024;
  const MIME = new Map([['image/jpeg','jpg'],['image/png','png'],['image/webp','webp'],['image/heic','heic'],['image/heif','heif']]);
  const digest = async (bytes) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2,'0')).join('');
  const encode = (bytes) => { let s = ''; for(let i=0;i<bytes.length;i+=8192) s += String.fromCharCode(...bytes.subarray(i,i+8192)); return btoa(s); };
  const decode = (text) => Uint8Array.from(atob(text), c=>c.charCodeAt(0));
  const collect = async (tables, context, run, progress, isCurrent) => {
    const photos = []; const paths = new Map(); let total = 0;
    for (const row of tables.growth_entries || []) {
      row.photo_refs = [];
      const sources = context.mode === 'remote' ? (row.photo_paths || []) : (row.photoUrls || []);
      if (context.mode !== 'remote' && (row.photoPaths || []).length > sources.length) throw new Error('이 기기의 사진 원본이 누락됐어요.');
      for (const path of sources) {
        if (!isCurrent()) throw new Error('가족 공간이 변경됐어요.');
        let photo = paths.get(path);
        if (!photo) {
          let blob;
          if (context.mode === 'remote') {
            if (typeof path !== 'string' || !path.startsWith(`${context.householdId}/`)) throw new Error('사진 경로를 확인할 수 없어요.');
            const result = await run(() => context.supabase.storage.from('growth-photos').download(path));
            if (result.error) throw new Error('원본 사진을 내려받지 못했어요. 사진을 확인하고 다시 시도해 주세요.');
            blob = result.data;
          } else {
            if (!/^data:image\/(jpeg|png|webp|heic|heif);base64,/.test(path)) throw new Error('이 기기의 사진 원본을 읽을 수 없어요.');
            const [header, data] = path.split(','); blob = new Blob([decode(data)],{type:header.slice(5,-7)});
          }
          total += blob.size;
          if (total > MAX_BYTES || blob.size > 10*1024*1024) throw new Error('사진 포함 백업은 한 번에 50MB까지 가능해요. 사진을 제외한 기록 백업도 사용할 수 있어요.');
          const mime = blob.type.split(';')[0];
          if (!MIME.has(mime)) throw new Error('지원하지 않는 사진 형식이에요.');
          const bytes = new Uint8Array(await blob.arrayBuffer());
          photo = { id: `photo-${photos.length}`, mime, sha256: await digest(bytes), data: encode(bytes) };
          photos.push(photo); paths.set(path,photo); progress(photos.length, total);
        }
        row.photo_refs.push({id:photo.id, sha256:photo.sha256});
      }
    }
    if (!isCurrent()) throw new Error('가족 공간이 변경됐어요.');
    return photos;
  };
  const validate = async (payload) => {
    const photos = payload.photos || []; let total = 0; const byId = new Map();
    for(const photo of photos) {
      if (!/^photo-\d+$/.test(photo.id) || byId.has(photo.id) || !MIME.has(photo.mime) || typeof photo.data !== 'string' || photo.data.length > 14*1024*1024) throw new Error('사진 백업 형식이 올바르지 않아요.');
      const bytes = decode(photo.data); total += bytes.length;
      if(total > MAX_BYTES || bytes.length > 10*1024*1024 || await digest(bytes) !== photo.sha256) throw new Error('사진 백업이 손상됐거나 너무 커요.');
      byId.set(photo.id, {...photo, bytes});
    }
    const referenced = new Set();
    for(const row of payload.tables.growth_entries) for(const ref of row.photo_refs || []) {
      const photo = byId.get(ref.id);
      if (!photo || photo.sha256 !== ref.sha256) throw new Error('기록에 연결된 사진이 누락됐어요.');
      referenced.add(ref.id);
    }
    if(referenced.size !== byId.size) throw new Error('연결되지 않은 사진이 있어요.');
    return byId;
  };
  const restore = async (payload, context, run, progress, isCurrent) => {
    const photos = await validate(payload); const paths = new Map(); let done = 0;
    for(const photo of photos.values()) {
      if(!isCurrent()) throw new Error('가족 공간이 변경됐어요.');
      // Content-addressed paths make retries safe after an ambiguous network failure.
      const path = `${context.householdId}/backup/${photo.sha256}.${MIME.get(photo.mime)}`;
      const result = await run(() => context.supabase.storage.from('growth-photos').upload(path, photo.bytes, {contentType:photo.mime,upsert:false}));
      if(result.error) {
        const existing = await run(() => context.supabase.storage.from('growth-photos').download(path));
        if(existing.error || await digest(await existing.data.arrayBuffer()) !== photo.sha256) throw new Error('사진 복원에 실패했어요. 같은 파일로 다시 시도할 수 있어요.');
      }
      paths.set(photo.id,path); progress(++done,photos.size);
    }
    if(!isCurrent()) throw new Error('가족 공간이 변경됐어요.');
    return payload.tables.growth_entries.map(row=>({...row,photo_paths:(row.photo_refs||[]).map(ref=>paths.get(ref.id))}));
  };
  window.FAMILY_BACKUP_MEDIA = { collect, validate, restore, MAX_BYTES };
})();
