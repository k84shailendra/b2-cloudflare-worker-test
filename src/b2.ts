export async function getDownloadAuthorization(apiUrl, accountToken, bucketId, fileName, validSeconds = 600) {
  const body = {
    bucketId,
    fileNamePrefix: fileName,
    validDurationInSeconds: validSeconds
  };
  const resp = await fetch(
    apiUrl + '/b2api/v2/b2_get_download_authorization',
    {
      method: 'POST',
      headers: {
        Authorization: accountToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    }
  );
  if (!resp.ok) throw new Error("B2 download_authorization error " + resp.status + ": " + await resp.text());
  return (await resp.json()).authorizationToken;
}
