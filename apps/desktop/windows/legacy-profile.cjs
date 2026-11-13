// Read old cookie names only while retaining an existing desktop identity.
const legacyNames = { profile: 'cadence_local_profile', mode: 'cadence_app_mode' };
async function migrateProfileCookies(cookies, origin) {
  const [current, legacy] = await Promise.all([
    cookies.get({url:origin,name:'english_local_profile'}),
    cookies.get({url:origin,name:legacyNames.profile}),
  ]);
  if (!current.length && legacy.length) {
    const old = legacy[0];
    await cookies.set({url:origin,name:'english_local_profile',value:old.value,path:'/',httpOnly:true,sameSite:'lax',expirationDate:old.expirationDate ?? Date.now()/1000+365*86400});
  }
  // Only remove a legacy profile after its new cookie has been stored.
  if (current.length || legacy.length) await cookies.remove(origin, legacyNames.profile);
  await cookies.remove(origin, legacyNames.mode);
}
module.exports = { migrateProfileCookies };
