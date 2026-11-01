// Handle all link clicks to open in new tab
document.addEventListener('DOMContentLoaded', () => {
    // Get all links in the popup
    const links = document.querySelectorAll('a');

    links.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const url = link.href;

            // Open in new tab
            chrome.tabs.create({ url: url });

            // Close popup
            window.close();
        });
    });
});
