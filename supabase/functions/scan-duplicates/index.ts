import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders as buildCors, authenticateCaller, isSystemAdmin } from "../_shared/security.ts";

const ENTITY_TABLE: Record<string, string> = {
  account:      "account",
  contact:      "contact",
  lead:         "lead",
  opportunity:  "opportunity",
  ticket:       "ticket",
};

const ENTITY_PK: Record<string, string> = {
  account:      "account_id",
  contact:      "contact_id",
  lead:         "lead_id",
  opportunity:  "opportunity_id",
  ticket:       "ticket_id",
};

const ENTITY_LABEL: Record<string, string[]> = {
  account:      ["account_name", "name"],
  contact:      ["full_name", "first_name", "last_name"],
  lead:         ["full_name", "first_name", "last_name", "topic"],
  opportunity:  ["topic", "name"],
  ticket:       ["title", "subject"],
};

const FIELD_PHYSICAL: Record<string, Record<string, string>> = {
  account: {
    accountnumber:    "account_number",
    address1_city:    "city",
    countrycode:      "country_code",
    createdon:        "created_at",
    description:      "description",
    industrycode:     "industry",
    modifiedon:       "modified_at",
    name:             "account_name",
    numberofemployees:"number_of_employees",
    ownerid:          "owner_id",
    revenue:          "annual_revenue",
    statuscode:       "status_code",
    telephone1:       "phone",
    websiteurl:       "website",
  },
  contact: {
    address1_city:    "city",
    countrycode:      "country_code",
    createdon:        "created_at",
    department:       "department",
    description:      "description",
    emailaddress1:    "email",
    firstname:        "first_name",
    jobtitle:         "job_title",
    lastname:         "last_name",
    mobilephone:      "mobile_phone",
    modifiedon:       "modified_at",
    ownerid:          "owner_id",
    parentcustomerid: "account_id",
    statuscode:       "status_code",
    telephone1:       "business_phone",
  },
  lead: {
    address1_city:    "city",
    companyname:      "company_name",
    countrycode:      "country_code",
    createdon:        "created_at",
    description:      "description",
    emailaddress:     "email",
    emailaddress1:    "email",
    firstname:        "first_name",
    jobtitle:         "job_title",
    lastname:         "last_name",
    leadsourcecode:   "lead_source",
    mobilephone:      "mobile_phone",
    modifiedon:       "modified_at",
    ownerid:          "owner_id",
    productid:        "product_id",
    statuscode:       "status_code",
    telephone1:       "phone",
  },
  opportunity: {
    closeprobability:     "probability",
    createdon:            "created_at",
    description:          "description",
    estimatedclosedate:   "estimated_close_date",
    estimatedvalue:       "estimated_value",
    modifiedon:           "modified_at",
    name:                 "topic",
    ownerid:              "owner_id",
    parentaccountid:      "account_id",
    parentcontactid:      "primary_contact_id",
    productid:            "product_id",
    stagecode:            "stage",
    statuscode:           "status_code",
  },
  ticket: {
    casetypecode:  "status_reason",
    createdon:     "created_at",
    customerid:    "account_id",
    description:   "description",
    modifiedon:    "modified_at",
    ownerid:       "owner_id",
    prioritycode:  "status_reason",
    resolution:    "resolution",
    resolvedon:    "resolved_at",
    statuscode:    "status_code",
    title:         "title",
  },
};

function resolvePhysical(entityLogical: string, logicalField: string): string {
  return FIELD_PHYSICAL[entityLogical]?.[logicalField] ?? logicalField;
}

function normalize(val: unknown): string {
  if (val == null) return "";
  return String(val).trim().toLowerCase().replace(/\s+/g, " ");
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  return dp[m][n];
}

function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const longer = na.length > nb.length ? na : nb;
  const shorter = na.length > nb.length ? nb : na;
  const dist = levenshtein(longer, shorter);
  return (longer.length - dist) / longer.length;
}

function getLabel(record: Record<string, unknown>, entityLogicalName: string): string {
  const fields = ENTITY_LABEL[entityLogicalName] ?? ["name"];
  for (const f of fields) {
    if (record[f]) return String(record[f]);
  }
  return "Unnamed";
}

interface FuzzyMatchField {
  field: string;
  threshold: number;
}

interface DuplicatePair {
  record_a_id: string;
  record_a_label: string;
  record_b_id: string;
  record_b_label: string;
  matched_fields: Array<{ field: string; match_type: "exact" | "fuzzy"; score?: number }>;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Authenticate caller and require an active system admin (this function uses
    // the service-role key and bypasses RLS, so it must gate on authorization).
    const auth = await authenticateCaller(req, supabaseUrl, serviceRoleKey, anonKey);
    if (!auth.ok) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!auth.isServiceRole && !(await isSystemAdmin(supabase, auth.userId))) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { job_id } = await req.json() as { job_id: string };

    if (!job_id) {
      return new Response(JSON.stringify({ error: "job_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: job, error: jobErr } = await supabase
      .from("duplicate_job")
      .select("*, rule:duplicate_detection_rule(*)")
      .eq("duplicate_job_id", job_id)
      .maybeSingle();

    if (jobErr || !job) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (job.status === "running" || job.status === "completed") {
      return new Response(JSON.stringify({ error: `Job is already ${job.status}` }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase
      .from("duplicate_job")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("duplicate_job_id", job_id);

    const rule = job.rule as {
      entity_logical_name: string;
      exact_match_fields: string[];
      fuzzy_match_fields: FuzzyMatchField[];
    } | null;

    if (!rule) {
      await supabase
        .from("duplicate_job")
        .update({ status: "failed", error_message: "Rule not found or was deleted", completed_at: new Date().toISOString() })
        .eq("duplicate_job_id", job_id);
      return new Response(JSON.stringify({ error: "Rule not found" }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const entityLogical = rule.entity_logical_name;
    const tableName = ENTITY_TABLE[entityLogical];
    const pkColumn = ENTITY_PK[entityLogical];
    const exactLogicalFields: string[] = rule.exact_match_fields ?? [];
    const fuzzyLogicalFields: FuzzyMatchField[] = rule.fuzzy_match_fields ?? [];

    const exactFields = exactLogicalFields.map((f) => resolvePhysical(entityLogical, f));
    const fuzzyFields = fuzzyLogicalFields.map((f) => ({
      field: resolvePhysical(entityLogical, f.field),
      logicalField: f.field,
      threshold: f.threshold,
    }));

    if (!tableName || !pkColumn) {
      await supabase
        .from("duplicate_job")
        .update({ status: "failed", error_message: `Unknown entity: ${entityLogical}`, completed_at: new Date().toISOString() })
        .eq("duplicate_job_id", job_id);
      return new Response(JSON.stringify({ error: "Unknown entity" }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: records, error: recErr } = await supabase
      .from(tableName)
      .select("*")
      .is("is_deleted", false)
      .limit(5000);

    if (recErr || !records) {
      await supabase
        .from("duplicate_job")
        .update({ status: "failed", error_message: recErr?.message ?? "Failed to fetch records", completed_at: new Date().toISOString() })
        .eq("duplicate_job_id", job_id);
      return new Response(JSON.stringify({ error: "Failed to fetch records" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const duplicatePairs: DuplicatePair[] = [];
    const seenPairs = new Set<string>();

    for (let i = 0; i < records.length; i++) {
      for (let j = i + 1; j < records.length; j++) {
        const a = records[i] as Record<string, unknown>;
        const b = records[j] as Record<string, unknown>;

        const matchedFields: DuplicatePair["matched_fields"] = [];

        let exactGroupSatisfied = exactFields.length === 0;
        if (exactFields.length > 0) {
          exactGroupSatisfied = true;
          for (let k = 0; k < exactFields.length; k++) {
            const physField = exactFields[k];
            const va = normalize(a[physField]);
            const vb = normalize(b[physField]);
            if (!va || !vb || va !== vb) {
              exactGroupSatisfied = false;
              break;
            }
            matchedFields.push({ field: exactLogicalFields[k], match_type: "exact" });
          }
        }

        if (!exactGroupSatisfied) continue;

        for (const { field: physField, logicalField, threshold } of fuzzyFields) {
          const va = normalize(a[physField]);
          const vb = normalize(b[physField]);
          if (!va || !vb) continue;
          const score = similarity(va, vb);
          if (score >= threshold / 100) {
            matchedFields.push({ field: logicalField, match_type: "fuzzy", score: Math.round(score * 100) });
          }
        }

        if (matchedFields.length === 0) continue;

        const aid = String(a[pkColumn]);
        const bid = String(b[pkColumn]);
        const pairKey = [aid, bid].sort().join("|");
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);

        duplicatePairs.push({
          record_a_id: aid,
          record_a_label: getLabel(a, entityLogical),
          record_b_id: bid,
          record_b_label: getLabel(b, entityLogical),
          matched_fields: matchedFields,
        });
      }
    }

    const summary = {
      entity: entityLogical,
      rule_name: (job.rule as Record<string, unknown>)?.name ?? "",
      exact_fields: exactLogicalFields,
      fuzzy_fields: fuzzyLogicalFields.map((f) => f.field),
      pairs: duplicatePairs.slice(0, 200),
      total_pairs: duplicatePairs.length,
    };

    await supabase
      .from("duplicate_job")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        records_scanned: records.length,
        duplicates_found: duplicatePairs.length,
        result_summary: summary,
      })
      .eq("duplicate_job_id", job_id);

    return new Response(
      JSON.stringify({ success: true, records_scanned: records.length, duplicates_found: duplicatePairs.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
