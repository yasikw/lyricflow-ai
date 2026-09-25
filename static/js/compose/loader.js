/* 演出パックのローダー: core.js の直後に読み込む。パックは同期で順に読み込まれる */
(() => {
  const me = document.currentScript;
  const base = me && me.src ? me.src.replace(/loader\.js.*$/, '') : '/js/compose/';
  const v = (me && /[?&]v=([^&]+)/.exec(me.src || '') || [])[1] || '';
  const PACKS = [
    'p_layouts_a.js', 'p_layouts_b.js', 'p_layouts_c.js', 'p_layouts_d.js',
    'p_enter.js', 'p_exit_hold.js', 'p_decor_treat.js', 'p_cam_trans_styles.js', 'p_motion_graphics.js', 'p_mg_layouts_n.js', 'p_mg_layouts_g.js', 'p_mg_motion.js', 'p_mg_decor_styles.js',
  ];
  for (const f of PACKS) document.write('<script src="' + base + f + (v ? '?v=' + v : '') + '"><\/script>');
})();
