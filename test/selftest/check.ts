import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Every page wrote every check for this platform, all true. Each writes to its own folder, in ~/.apargon.
const mac = process.platform === 'darwin';
const PLAIN =
  'no_node storage_own own_folder_named reads_page_folder reads_home reads_outside read_range read_options_refused readdir_stats page_folder_write_refused home_write_refused other_own_folder_write_refused rename_out_refused own_write copy copy_out_refused own_rename rm_folder_needs_recursive own_rm trash_own trash_refused watch_folder watch_survives_second_window watch_outside bytes_roundtrip bytes_copy overwrite_truncates read_edges read_folder_refused text_roundtrip appends_all_kept parallel_writes odd_names picks_seeded picked_roundtrip picked_overwrite_truncates picked_copy picked_append picked_names_refused write_cut_by_close save_names_refused pdf_rendered range_served media_seeks menu_set tray_set tray_refused progress_set progress_refused window_bounds_set window_offscreen_refused window_switches_refused shortcuts_refused keep_awake badge_set power_read secrets_per_page secret_roundtrip reply_large replies_parallel secret_names_refused run_refused spawn_refused listen_refused connect_refused use_refused open_scheme_refused screen_capture_refused fetch_blocked websocket_blocked permissions_denied file_frame_allowed web_frame_refused other_file_window_refused second_window_settings second_window_bad_settings_refused navigation_refused';
const NET =
  'curl_declared curl_undeclared_blocked curl_direct_blocked proxy_refuses_other_port local_port_declared local_port_undeclared_blocked local_port_direct_blocked socket_blocked read_everywhere program_writes_granted program_own_folder_write program_outside_write_blocked program_home_write_blocked program_hard_link_refused program_bundled_runs program_no_trampoline_fds program_input program_bytes program_timeout program_output_large program_output_limit spawn_streams spawn_input spawn_kill spawn_output_large spawn_undeclared_refused options_as_args_refused program_env_named program_env_unnamed_left_out undeclared_program_refused unfenced_runs listen_answers listen_localhost_only listen_closed fetch_declared fetch_declared_http fetch_undeclared_blocked fetch_local_declared fetch_local_undeclared_blocked connect_declared connect_tls connect_undeclared_refused secrets_per_page clipboard_read_granted microphone_permission_granted camera_permission_denied_without_tag';
const MAC =
  'program_download_service_blocked program_webkit_service_blocked program_open_url_blocked program_open_app_blocked program_apple_event_blocked program_shortcuts_blocked program_preference_write_blocked program_mount_blocked program_smb_device_blocked program_terminal_blocked program_volumes_listed page_write_marked window_size_declared window_switches_declared window_click_through_private shortcuts_picked window_opacity window_fixed_size_refused window_document cursor_read hear_other_app share_url_refused';
// Windows has its own pages: its programs and paths are not POSIX ones.
const EXPECTED: Record<string, string> =
  process.platform === 'win32' ?
    {
      plain: PLAIN,
      win: 'fetch_declared fetch_undeclared_blocked local_port_declared local_port_undeclared_blocked network_path_refused network_url_refused page_stream_refused page_trailing_dot_refused',
      'win-programs':
        'curl_declared curl_undeclared_blocked curl_direct_blocked local_port_declared local_port_direct_blocked local_port_undeclared_blocked program_writes_granted program_outside_write_blocked program_reads_home program_installed_runs program_input program_timeout spawn_streams spawn_kill spawn_undeclared_refused program_stdin_own program_env_named program_env_unnamed_left_out undeclared_program_refused options_as_args_refused',
      'win-devices':
        'webcam_capability microphone_capability location_capability usb_capability serialcommunication_capability humaninterfacedevice_capability usb_api serial_api hid_api midi_api',
      system: 'node child_process writes_anywhere network papp_api window_shape_set',
    }
  : {
      plain: PLAIN,
      net: `${NET}${mac ? '' : ' page_process_env_unnamed_left_out socket_internet_made socket_netlink_made socket_vsock_refused socket_pair_made socket_pair_datagram_refused'}`,
      socket: `socket_declared${mac ? ' socket_undeclared_blocked' : ''}`,
      system: 'node child_process writes_anywhere network papp_api window_shape_set',
      ...(mac && { mac: MAC }),
    };
const root = path.join(os.homedir(), '.apargon');
const written = Object.fromEntries(
  fs.readdirSync(root).flatMap(folder =>
    fs
      .readdirSync(path.join(root, folder))
      .filter(name => /^selftest-result-.+\.json$/.test(name))
      .map(name => [name.slice('selftest-result-'.length, -'.json'.length), path.join(root, folder, name)])
  )
);
const checks = Object.entries(EXPECTED).flatMap(([page, names]) => {
  const expected = names.split(' ');
  const result: Record<string, unknown> = written[page] ? JSON.parse(fs.readFileSync(written[page], 'utf8')) : {};

  return [...new Set([...expected, ...Object.keys(result)])].map(check => ({
    page,
    check,
    why:
      !(check in result) ? 'missing'
      : !expected.includes(check) ? `not expected, add it to check.ts: ${JSON.stringify(result[check])}`
      : result[check] === true ? null
      : `= ${JSON.stringify(result[check])}`,
  }));
});

// macOS marks what a program wrote once its .papp file closes.
if (mac && written.mac) {
  const file = path.join(path.dirname(written.mac), 'program-written.txt');
  const marked = spawnSync('/usr/bin/xattr', ['-p', 'com.apple.quarantine', file]).status === 0;
  checks.push({ page: 'mac', check: 'program_write_marked', why: marked ? null : `${file} has no quarantine mark` });
}

checks.forEach(({ page, check, why }) => console.log(`${why ? 'FAIL' : 'ok  '} ${page} ${check}${why ? ` ${why}` : ''}`));
process.exit(checks.every(({ why }) => why === null) ? 0 : 1);
