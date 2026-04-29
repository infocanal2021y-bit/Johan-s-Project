/**
 * AppBackground — BBVA-style clean light background for the authenticated shell.
 *
 * Minimalist corporate banking aesthetic: pure light surface with a subtle
 * tint gradient. No photographic imagery, no floating orbs — clarity and
 * legibility are paramount for a banking dashboard.
 */
export const AppBackground = () => (
    <div
        aria-hidden="true"
        className="fixed inset-0 overflow-hidden pointer-events-none"
        style={{ zIndex: 0 }}
    >
        {/* Base surface */}
        <div className="absolute inset-0 bg-[#F4F6F8]" />
        {/* Subtle top gradient tint (BBVA brand whisper) */}
        <div
            className="absolute inset-x-0 top-0 h-[280px]"
            style={{
                background:
                    'linear-gradient(180deg, rgba(25, 115, 184, 0.04) 0%, rgba(25, 115, 184, 0) 100%)',
            }}
        />
    </div>
);

export default AppBackground;
