// A Worker's own read of a file: URL, past the page's handlers. Only the OS can refuse it.
onmessage = ({ data: url }) => {
  try {
    const request = new XMLHttpRequest();
    request.open('GET', url, false);
    request.send();
    postMessage({ status: request.status, length: request.responseText.length });
  } catch (err) {
    postMessage({ error: err.name });
  }
};
