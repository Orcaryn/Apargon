import fs from 'fs';
import path from 'path';

const mac = process.platform === 'darwin';
const PLAIN =
  'no_node storage_own own_folder_read own_subfolder_read own_folder_write_refused own_subfolder_write_refused granted_write page_write_refused page_rename_refused options_refused watch_folder watch_file_renamed_over watch_survives_second_window watch_removed watch_recursive watch_outside_refused watch_hidden_refused hidden_below_match_refused any_depth_write any_depth_refused readdir_stats read_range append append_refused copy copy_refused save_names_refused given_empty secret_roundtrip secret_names_refused pdf_rendered menu_set tray_set tray_refused progress_set progress_refused power_read outside_read_refused outside_write_refused home_read_refused hidden_write_refused run_refused listen_refused spawn_refused open_type_refused open_outside_refused open_scheme_refused fetch_blocked outside_file_url_refused other_file_frame_refused other_file_window_refused use_refused screen_capture_refused permissions_denied';
// Windows has its own pages: its programs and paths are not POSIX ones.
const EXPECTED =
  process.platform === 'win32' ?
    {
      'result.json': PLAIN,
      'result-win.json':
        'fetch_declared fetch_undeclared_blocked local_port_declared local_port_undeclared_blocked network_path_refused network_url_refused network_open_refused page_stream_refused page_trailing_dot_refused',
      'result-win-programs.json':
        'curl_declared curl_undeclared_blocked curl_direct_blocked local_port_declared local_port_direct_blocked local_port_undeclared_blocked program_writes_granted program_outside_write_blocked program_installed_runs program_input program_timeout spawn_streams spawn_kill spawn_undeclared_refused program_env_named program_env_unnamed_left_out undeclared_program_refused options_as_args_refused',
      'result-win-devices.json':
        'webcam_capability microphone_capability location_capability usb_capability serialcommunication_capability humaninterfacedevice_capability usb_api serial_api hid_api midi_api',
      'result-win-system.json': 'ungranted_write_refused child_process storage_apart electron_window grants_protected curl_blocked fetch_blocked dns_blocked printers_reachable',
    }
  : {
      'result.json': PLAIN,
      'result-system.json': `ungranted_write_refused secrets_hidden child_process storage_apart electron_window grants_protected terminal_unreachable curl_blocked fetch_blocked dns_blocked ${mac ? 'download_service_blocked webkit_blocked trust_blocked open_app_blocked apple_event_blocked preference_write_blocked' : 'processes_hidden own_session socket_folders_hidden other_pages_sockets_hidden'}`,
      ...(mac && { 'result-mac.json': 'proxy_refuses_own_lan_address program_open_app_blocked program_apple_event_blocked program_preference_write_blocked window_size_declared' }),
      'result-net.json': `curl_declared curl_undeclared_blocked curl_direct_blocked proxy_refuses_this_computer proxy_refuses_local_network proxy_allows_declared_lan_address local_port_declared local_port_undeclared_blocked socket_declared read_granted read_only program_writes_granted program_outside_write_blocked program_bundled_runs program_input program_bytes program_timeout spawn_streams spawn_input spawn_kill spawn_undeclared_refused spawn_options_as_args_refused program_env_named program_env_unnamed_left_out undeclared_program_refused options_as_args_refused fetch_declared fetch_declared_http fetch_wildcard_subdomain fetch_wildcard_apex_blocked fetch_undeclared_blocked listen_answers listen_closed connect_declared connect_tls connect_undeclared_refused connect_local_network_refused clipboard_read_granted microphone_permission_granted camera_permission_denied_without_tag program_hidden_write_blocked program_own_folder_write_blocked program_page_write_blocked ${mac ? 'socket_undeclared_blocked proxy_refuses_connect_without_port' : 'own_sockets_only page_process_env_unnamed_left_out'}`,
    };
const checks = Object.entries(EXPECTED).flatMap(([file, names]) => {
  const expected = names.split(' ');
  const resultFile = path.join(import.meta.dirname, 'pages', 'results', file);
  // Apargon makes a written file before the page starts: one the page never wrote is empty.
  const text = fs.existsSync(resultFile) ? fs.readFileSync(resultFile, 'utf8') : '';
  const result: Record<string, unknown> = text === '' ? {} : JSON.parse(text);

  return [...new Set([...expected, ...Object.keys(result)])].map(check => ({
    file,
    check,
    why:
      !(check in result) ? 'missing'
      : !expected.includes(check) ? 'not expected: add it to check.ts'
      : result[check] === true ? null
      : `= ${JSON.stringify(result[check])}`,
  }));
});

checks.forEach(({ file, check, why }) => console.log(`${why ? 'FAIL' : 'ok  '} ${file} ${check}${why ? ` ${why}` : ''}`));
process.exit(checks.every(({ why }) => why === null) ? 0 : 1);
