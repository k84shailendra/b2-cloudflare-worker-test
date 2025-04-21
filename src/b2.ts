// src/b2.ts

export async function authorizeAccount(auth: string) {
  const res = await fetch("https://api.backblazeb2.com/b2api/v2/b2_authorize_account", {
    headers: { Authorization: auth }
  });
  if (!res.ok) {
    return { ok: false, status: res.status };
  }
  const j = await res.json();
  return {
    ok: true,
    downloadUrl: j.downloadUrl,
    authorizationToken: j.authorizationToken,
    apiUrl: j.apiUrl,
    status: res.status
  };
}

export async function getDownloadAuthorization(apiUrl: string, token: string, bucketId: string, fileName: string, validSeconds = 600) {
  const body = {
    bucketId,
    fileNamePrefix: fileName,
    validDurationInSeconds: validSeconds
  };
  const resp = await fetch(apiUrl + '/b2api/v2/b2_get_download_authorization', {
    method: 'POST',
    headers: {
      Authorization: token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!resp.ok) throw new Error("B2 download_authorization error " + resp.status + ": " + await resp.text());
  return (await resp.json()).authorizationToken;
}
