import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders = {
"Access-Control-Allow-Origin": "*",
"Access-Control-Allow-Headers":
"authorization, x-client-info, apikey, content-type",
"Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(data: unknown, status = 200) {
return new Response(JSON.stringify(data), {
status,
headers: {
...corsHeaders,
"Content-Type": "application/json",
},
});
}
Deno.serve(async (req) => {
console.log("ADMIN USERS DEBUG 1 - request received", {
method: req.method,
hasAuthorization: !!req.headers.get("Authorization"),
});
if (req.method === "OPTIONS") {
console.log("ADMIN USERS DEBUG - OPTIONS");
return new Response("ok", { headers: corsHeaders });
}
try {
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
const serviceRoleKey =
Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
console.log("ADMIN USERS DEBUG 2 - environment", {
hasSupabaseUrl: !!supabaseUrl,
hasAnonKey: !!anonKey,
hasServiceRoleKey: !!serviceRoleKey,
});
if (!supabaseUrl || !anonKey || !serviceRoleKey) {
console.error(
"ADMIN USERS DEBUG FAILED - missing environment variable"
);
return json(
{
error: "Missing Supabase environment variable",
debug_stage: 2,
},
500
);
}
const authorization =
req.headers.get("Authorization");
if (!authorization) {
console.error(
"ADMIN USERS DEBUG FAILED - missing authorization"
);
return json(
{
error: "Missing authorization",
debug_stage: 3,
},
401
);
}
console.log(
"ADMIN USERS DEBUG 3 - authorization header exists"
);
const userClient = createClient(
supabaseUrl,
anonKey,
{
global: {
headers: {
Authorization: authorization,
},
},
}
);
const adminClient = createClient(
supabaseUrl,
serviceRoleKey,
{
auth: {
autoRefreshToken: false,
persistSession: false,
},
}
);
console.log(
"ADMIN USERS DEBUG 4 - clients created"
);
const {
data: { user },
error: userError,
} = await userClient.auth.getUser();
console.log(
"ADMIN USERS DEBUG 5 - getUser result",
{
userId: user?.id || null,
userError: userError?.message || null,
}
);
if (userError || !user) {
console.error(
"ADMIN USERS DEBUG FAILED - invalid session",
userError
);
return json(
{
error: "Invalid session",
debug_stage: 5,
debug_message:
userError?.message || "User missing",
},
401
);
}
const {
data: actorProfile,
error: actorError,
} = await adminClient
.from("profiles")
.select("id, role, is_active, all_businesses_access")
.eq("id", user.id)
.single();
console.log(
"ADMIN USERS DEBUG 6 - actor profile",
{
userId: user.id,
actorProfile,
actorError:
actorError?.message || null,
actorErrorCode:
actorError?.code || null,
}
);
if (actorError) {
console.error(
"ADMIN USERS DEBUG FAILED - profile query error",
actorError
);
return json(
{
error: "Profile lookup failed",
debug_stage: 6,
debug_message: actorError.message,
debug_code: actorError.code,
user_id: user.id,
},
403
);
}
if (!actorProfile) {
console.error(
"ADMIN USERS DEBUG FAILED - profile missing"
);
return json(
{
error: "Profile not found",
debug_stage: 6,
user_id: user.id,
},
403
);
}
if (!actorProfile.is_active) {
console.error(
"ADMIN USERS DEBUG FAILED - user inactive"
);
return json(
{
error: "User is not active",
debug_stage: 6,
user_id: user.id,
role: actorProfile.role,
is_active: actorProfile.is_active,
},
403
);
}
const actorRole = String(
actorProfile.role || ""
)
.trim()
.toLowerCase();
console.log(
"ADMIN USERS DEBUG 7 - normalized actor",
{
userId: user.id,
rawRole: actorProfile.role,
actorRole,
isActive: actorProfile.is_active,
}
);
let body;
try {
body = await req.json();
} catch (bodyError) {
console.error(
"ADMIN USERS DEBUG FAILED - invalid JSON",
bodyError
);
return json(
{
error: "Invalid request body",
debug_stage: 8,
},
400
);
}
const action = body.action;
console.log(
"ADMIN USERS DEBUG 8 - request body",
{
action,
requestedRole: body.role || null,
username: body.username || null,
displayName:
body.display_name || null,
businessIds:
Array.isArray(body.business_ids)
? body.business_ids
: null,
hasPassword:
typeof body.password === "string" &&
body.password.length > 0,
passwordLength:
typeof body.password === "string"
? body.password.length
: 0,
}
);
// =====================================
// USER CHANGES OWN PASSWORD
// =====================================
if (action === "change_own_password") {
console.log(
"ADMIN USERS DEBUG 9 - change own password"
);
const password =
String(body.password || "");
if (password.length < 6) {
return json(
{
error:
"Password must contain at least 6 characters",
},
400
);
}
const { error } =
await adminClient.auth.admin
.updateUserById(
user.id,
{ password }
);
if (error) throw error;
await adminClient
.from("profiles")
.update({
must_change_password: false,
updated_at:
new Date().toISOString(),
})
.eq("id", user.id);
return json({ success: true });
}
// Same rule as the database's can_administer(): the owner, or an admin
// with access to all businesses. A limited admin is not an administrator.
const canAdminister =
actorRole === "owner" ||
(actorRole === "admin" && actorProfile.all_businesses_access === true);
console.log(
"ADMIN USERS DEBUG 10 - checking admin permission",
{
actorRole,
allowed: canAdminister,
}
);
if (!canAdminister) {
console.error(
"ADMIN USERS DEBUG FAILED - not authorized",
{
actorRole,
rawRole: actorProfile.role,
userId: user.id,
}
);
return json(
{
error: "Not authorized",
debug_stage: 10,
actor_role: actorRole,
raw_role: actorProfile.role,
user_id: user.id,
},
403
);
}
// =====================================
// CREATE USER
// =====================================
if (action === "create_user") {
const displayName = String(
body.display_name || ""
).trim();
const username = String(
body.username || ""
)
.trim()
.toLowerCase();
const password =
String(body.password || "");
const role = String(
body.role || "manager"
)
.trim()
.toLowerCase();
const businessIds =
Array.isArray(body.business_ids)
? body.business_ids
: [];
const recoveryEmail =
String(
body.recovery_email || ""
).trim() || null;
const recoveryPhone =
String(
body.recovery_phone || ""
).trim() || null;
const mustChangePassword =
body.must_change_password !== false;
console.log(
"ADMIN USERS DEBUG 11 - CREATE USER",
{
actorUserId: user.id,
actorRole,
requestedRole: role,
username,
displayName,
businessIds,
passwordLength:
password.length,
}
);
if (
!displayName ||
!username ||
!password
) {
console.error(
"ADMIN USERS DEBUG FAILED - missing create-user field"
);
return json(
{
error:
"Name, username and password are required",
debug_stage: 11,
},
400
);
}
if (
!/^[a-z0-9._-]+$/.test(
username
)
) {
return json(
{
error:
"Username contains invalid characters",
debug_stage: 11,
},
400
);
}
if (password.length < 6) {
return json(
{
error:
"Password must contain at least 6 characters",
debug_stage: 11,
},
400
);
}
if (
![
"owner",
"admin",
"manager",
].includes(role)
) {
return json(
{
error: "Invalid role",
debug_stage: 11,
received_role: role,
},
400
);
}
if (
role === "owner" &&
actorRole !== "owner"
) {
console.error(
"ADMIN USERS DEBUG FAILED - owner creation denied",
{
actorRole,
requestedRole: role,
}
);
return json(
{
error:
"Only an owner can create another owner",
debug_stage: 11,
actor_role: actorRole,
requested_role: role,
actor_user_id: user.id,
},
403
);
}
const internalEmail =
`${username}@izazoo.local`;
console.log(
"ADMIN USERS DEBUG 12 - creating Auth user",
{
internalEmail,
role,
}
);
const {
data: created,
error: createError,
} =
await adminClient.auth.admin
.createUser({
email: internalEmail,
password,
email_confirm: true,
});
console.log(
"ADMIN USERS DEBUG 13 - Auth create result",
{
createdUserId:
created?.user?.id || null,
createError:
createError?.message || null,
}
);
if (createError) {
console.error(
"ADMIN USERS DEBUG FAILED - Auth createUser",
createError
);
return json(
{
error: createError.message,
debug_stage: 13,
},
500
);
}
try {
const newUserId =
created.user.id;
console.log(
"ADMIN USERS DEBUG 14 - inserting profile",
{
newUserId,
username,
role,
}
);
const {
error: profileError,
} =
await adminClient
.from("profiles")
.insert({
id: newUserId,
username,
display_name:
displayName,
role,
is_active: true,
recovery_email:
recoveryEmail,
recovery_phone:
recoveryPhone,
must_change_password:
mustChangePassword,
updated_at:
new Date()
.toISOString(),
});
if (profileError) {
console.error(
"ADMIN USERS DEBUG FAILED - profile insert",
profileError
);
throw profileError;
}
console.log(
"ADMIN USERS DEBUG 15 - profile inserted"
);
if (businessIds.length) {
const memberships =
businessIds.map(
(businessId: number) => ({
user_id:
newUserId,
business_id:
Number(businessId),
})
);
console.log(
"ADMIN USERS DEBUG 16 - inserting memberships",
memberships
);
const {
error:
membershipError,
} =
await adminClient
.from(
"user_businesses"
)
.insert(memberships);
if (membershipError) {
console.error(
"ADMIN USERS DEBUG FAILED - membership insert",
membershipError
);
throw membershipError;
}
}
console.log(
"ADMIN USERS DEBUG 17 - writing activity"
);
const {
error: activityError,
} =
await adminClient
.from(
"admin_activity"
)
.insert({
actor_id: user.id,
action:
"user_created",
target_user_id:
newUserId,
details: {
display_name:
displayName,
username,
role,
business_ids:
businessIds,
},
});
if (activityError) {
console.error(
"ADMIN USERS DEBUG - activity log failed",
activityError
);
// Activity logging should not
// cancel successful user creation.
}
console.log(
"ADMIN USERS DEBUG 18 - SUCCESS",
{
newUserId,
username,
role,
}
);
return json({
success: true,
user_id: newUserId,
});
} catch (error) {
console.error(
"ADMIN USERS DEBUG FAILED - rolling back Auth user",
error
);
if (created?.user?.id) {
await adminClient.auth.admin
.deleteUser(
created.user.id
);
}
throw error;
}
}
// =====================================
// RESET USER PASSWORD
// =====================================
if (action === "reset_password") {
const targetUser =
String(body.user_id || "");
const password =
String(body.password || "");
if (
!targetUser ||
password.length < 6
) {
return json(
{ error: "Invalid request" },
400
);
}
const { data: targetProfile } =
await adminClient
.from("profiles")
.select("role")
.eq("id", targetUser)
.single();
if (
targetProfile?.role ===
"owner" &&
actorRole !== "owner"
) {
return json(
{
error:
"Only an owner can reset an owner password",
},
403
);
}
const { error } =
await adminClient.auth.admin
.updateUserById(
targetUser,
{ password }
);
if (error) throw error;
await adminClient
.from("profiles")
.update({
must_change_password: true,
updated_at:
new Date().toISOString(),
})
.eq("id", targetUser);
await adminClient
.from("admin_activity")
.insert({
actor_id: user.id,
action: "password_reset",
target_user_id:
targetUser,
});
return json({ success: true });
}
// =====================================
// UPDATE USER
// =====================================
if (action === "update_user") {
const targetUser =
String(body.user_id || "");
const displayName = String(
body.display_name || ""
).trim();
const username = String(
body.username || ""
)
.trim()
.toLowerCase();
if (
!targetUser ||
!displayName ||
!username
) {
return json(
{ error: "Invalid request" },
400
);
}
if (
!/^[a-z0-9._-]+$/.test(
username
)
) {
return json(
{
error:
"Invalid username",
},
400
);
}
const {
data: targetProfile,
} =
await adminClient
.from("profiles")
.select(
"role, username"
)
.eq("id", targetUser)
.single();
if (
targetProfile?.role ===
"owner" &&
actorRole !== "owner"
) {
return json(
{
error:
"Only an owner can edit an owner",
},
403
);
}
if (
targetProfile?.username !==
username
) {
const {
error: authError,
} =
await adminClient.auth.admin
.updateUserById(
targetUser,
{
email:
`${username}@izazoo.local`,
email_confirm:
true,
}
);
if (authError)
throw authError;
}
const {
error: profileError,
} =
await adminClient
.from("profiles")
.update({
username,
display_name:
displayName,
recovery_email:
String(
body.recovery_email ||
""
).trim() || null,
recovery_phone:
String(
body.recovery_phone ||
""
).trim() || null,
updated_at:
new Date()
.toISOString(),
})
.eq("id", targetUser);
if (profileError)
throw profileError;
await adminClient
.from("admin_activity")
.insert({
actor_id: user.id,
action:
"user_profile_updated",
target_user_id:
targetUser,
details: {
display_name:
displayName,
username,
},
});
return json({ success: true });
}
console.error(
"ADMIN USERS DEBUG FAILED - unknown action",
{ action }
);
return json(
{
error: "Unknown action",
debug_stage: 99,
received_action:
action || null,
},
400
);
} catch (error) {
console.error(
"ADMIN USERS DEBUG UNCAUGHT ERROR",
error
);
return json(
{
error:
error instanceof Error
? error.message
: "Unexpected server error",
debug_stage: "uncaught",
},
500
);
}
});
