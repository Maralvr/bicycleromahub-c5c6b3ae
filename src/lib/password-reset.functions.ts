import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const updatePasswordFromRecoverySession = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        accessToken: z.string().min(20),
        password: z.string().min(6).max(128),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(
      data.accessToken,
    );

    if (userError || !userData.user) {
      throw new Error("Recovery session is invalid or expired. Request a new reset email.");
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(userData.user.id, {
      password: data.password,
    });

    if (error) throw new Error(error.message);

    return { ok: true };
  });