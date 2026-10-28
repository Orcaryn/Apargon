import fs from 'fs';
import path from 'path';

const mac = process.platform === 'darwin';
const EXPECTED = {
  'result.json':
    'no_node storage_own own_folder_read own_subfolder_read own_folder_write_refused own_subfolder_write_refused granted_write page_write_refused page_rename_refused options_refused watch_folder watch_file_renamed_over watch_survives_second_window watch_removed watch_recursive watch_outside_refused watch_hidden_refused hidden_below_match_refused readdir_stats read_range append append_refused copy copy_refused save_names_refused outside_read_refused outside_write_refused home_read_refused hidden_write_refused run_refused spawn_refused fetch_blocked outside_file_url_refused other_file_frame_refused other_file_window_refused use_refused screen_capture_refused permissions_denied',
  'result-node.json': `fs_anywhere child_process storage_apart electron_window grants_protected curl_blocked fetch_blocked dns_blocked ${mac ? 'download_service_blocked webkit_blocked trust_blocked' : 'processes_hidden own_session socket_folders_hidden other_pages_sockets_hidden'}`,
  'result-net.json': `curl_declared curl_undeclared_blocked curl_direct_blocked proxy_refuses_this_computer proxy_refuses_local_network proxy_allows_declared_lan_address read_granted read_only program_writes_granted program_outside_write_blocked program_input program_bytes program_timeout spawn_streams spawn_input spawn_kill spawn_undeclared_refused spawn_options_as_args_refused program_env_named program_env_unnamed_left_out program_ssh_hidden undeclared_program_refused options_as_args_refused fetch_declared fetch_declared_http fetch_wildcard_subdomain fetch_wildcard_apex_blocked fetch_undeclared_blocked clipboard_read_granted microphone_permission_granted camera_permission_denied_without_tag ${mac ? 'proxy_refuses_connect_without_port program_hidden_write_blocked program_own_folder_write_blocked program_page_write_blocked program_open_app_blocked program_apple_event_blocked program_preference_write_blocked' : 'own_sockets_only page_process_env_unnamed_left_out'}`,
};
const checks = Object.entries(EXPECTED).flatMap(([file, names]) => {
  const expected = names.split(' ');
  const resultFile = path.join(import.meta.dirname, file);
  const result: Record<string, unknown> = fs.existsSync(resultFile) ? JSON.parse(fs.readFileSync(resultFile, 'utf8')) : {};

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
