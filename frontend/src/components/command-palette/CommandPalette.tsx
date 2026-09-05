import { Command } from "cmdk";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useMyPermissions } from "@/features/admin/queries";
import { useAuth } from "@/features/auth/useAuth";
import { useCommandPalette } from "@/hooks/use-command-palette";
import { overlayVariants, dialogContentVariants } from "@/components/motion/overlay-variants";
import type { UserRole } from "@/lib/api-types";

const ADMIN_ROLES: UserRole[] = ["superuser", "program_admin", "branch_admin"];

const ITEM_CLASS =
  "cursor-pointer rounded-control px-2 py-2 text-ui text-text-primary data-[selected=true]:bg-accent";

export function CommandPalette() {
  const { open, setOpen } = useCommandPalette();
  const { status, user } = useAuth();
  const { data: permissions } = useMyPermissions();
  const navigate = useNavigate();

  function go(path: string) {
    setOpen(false);
    navigate(path);
  }

  const isAdmin = !!user && ADMIN_ROLES.includes(user.role);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
          <motion.div
            className="fixed inset-0 bg-black/40"
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            onClick={() => setOpen(false)}
          />
          <motion.div
            className="relative z-10 w-full max-w-lg overflow-hidden rounded-panel border border-border bg-surface-elevated shadow-floating"
            variants={dialogContentVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
          >
            <Command label="Command palette" shouldFilter>
              <Command.Input
                autoFocus
                placeholder="Jump to…"
                className="w-full border-b border-border bg-transparent px-4 py-3 text-ui text-text-primary outline-none placeholder:text-text-muted"
              />
              <Command.List className="max-h-80 overflow-y-auto p-2">
                <Command.Empty className="px-2 py-6 text-center text-ui text-text-muted">
                  No matches.
                </Command.Empty>
                <Command.Group
                  heading="Navigate"
                  className="text-caption text-text-muted [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
                >
                  <Command.Item onSelect={() => go("/browse")} className={ITEM_CLASS}>
                    Browse programs
                  </Command.Item>
                  <Command.Item onSelect={() => go("/search")} className={ITEM_CLASS}>
                    Search notes
                  </Command.Item>
                  {status === "authenticated" && (
                    <>
                      <Command.Item onSelect={() => go("/home")} className={ITEM_CLASS}>
                        Home
                      </Command.Item>
                      <Command.Item onSelect={() => go("/my-uploads")} className={ITEM_CLASS}>
                        My uploads
                      </Command.Item>
                      <Command.Item onSelect={() => go("/upload")} className={ITEM_CLASS}>
                        Upload a note
                      </Command.Item>
                      {isAdmin && (
                        <Command.Item onSelect={() => go("/moderate")} className={ITEM_CLASS}>
                          Moderation queue
                        </Command.Item>
                      )}
                      {permissions && permissions.size > 0 && (
                        <Command.Item onSelect={() => go("/admin")} className={ITEM_CLASS}>
                          Admin
                        </Command.Item>
                      )}
                    </>
                  )}
                </Command.Group>
              </Command.List>
            </Command>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
