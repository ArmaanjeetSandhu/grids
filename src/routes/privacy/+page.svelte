<script lang="ts">
	import { resolve } from '$app/paths';
	import LegalPage from '$lib/LegalPage.svelte';

	const REPO = 'https://github.com/ArmaanjeetSandhu/grids';
</script>

<LegalPage title="Privacy Policy" updated="October 15, 2026" current="privacy">
	<p>
		This Privacy Policy explains how Grids, a free, browser-based tool for building crossword grids
		(the "Service"), handles information. Grids is made by Armaanjeet Singh Sandhu (the
		"developer"). The short version: Grids does not collect, receive or store any of your personal
		information, and your puzzles never leave your device. This policy should be read alongside the
		<a href={resolve('/terms')}>Terms of Service</a>.
	</p>

	<h2>1. Information collected</h2>
	<p>None. Grids has:</p>
	<ul>
		<li>no accounts, sign-ins or contact forms;</li>
		<li>no analytics, telemetry, error reporting or tracking of any kind;</li>
		<li>no advertising, and no cookies; and</li>
		<li>
			no Grids server or database. The Service is a set of static files that your browser downloads
			and runs. Your grids, entries, clues, titles and files are never sent to the developer.
		</li>
	</ul>

	<h2>2. What is stored on your device</h2>
	<p>
		So you can pick up where you left off, Grids uses your browser’s local storage to keep two items
		on your device:
	</p>
	<ul>
		<li>
			<strong>Your setup choices</strong>: the grid size, whether the grid is divided by blocks or
			bars, and your chosen symmetry and constraint options.
		</li>
		<li>
			<strong>Your current puzzle</strong>: the grid, its letters and markings, your clues and the
			puzzle’s title.
		</li>
	</ul>
	<p>
		This data is stored by your browser for this site only. It is not a cookie, is not sent with web
		requests, and the developer has no way to see it. It stays until you remove it: starting a new
		grid clears the saved puzzle, and clearing your browser’s site data for Grids removes both
		items. If your browser blocks storage, Grids still works but won’t remember anything between
		visits.
	</p>
	<p>
		Grids also checks, inside your browser, whether you are on an Apple device so that it can show
		the right keyboard shortcuts. That check is not stored or sent anywhere.
	</p>

	<h2>3. Importing and exporting files</h2>
	<p>
		When you import an IPUZ file, your browser reads it locally; the file is not uploaded. When you
		export, your browser creates the file on your device. What you do with exported files, such as
		sharing or publishing them, is up to you.
	</p>

	<h2>4. Third-party services</h2>
	<p>
		Loading Grids involves two outside providers. Your browser contacts them directly, and they
		handle the resulting information under their own policies, not this one.
	</p>
	<ul>
		<li>
			<strong>GitHub Pages</strong> hosts the site. Like any web host, GitHub receives standard
			request information, such as your IP address, browser type and the pages requested, and may
			keep it in server logs for security and operational purposes. The developer has no access to
			those logs. See
			<a
				href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement"
				>GitHub’s Privacy Statement</a
			>.
		</li>
		<li>
			<strong>Google Fonts</strong> supplies the Libre Franklin typeface, so your browser requests
			font files from Google’s servers, which receive your IP address and similar request
			information. See
			<a href="https://policies.google.com/privacy">Google’s Privacy Policy</a>.
		</li>
	</ul>
	<p>
		The GitHub link on the site, and links in this policy, take you to sites outside the developer’s
		control. Their own privacy policies apply once you are there.
	</p>

	<h2>5. Your choices and rights</h2>
	<p>
		Because the developer holds no personal information about you, there is nothing to access,
		correct, export or delete on your behalf. Everything Grids keeps is on your own device and under
		your control, as described in section 2. For information held by GitHub or Google, you can
		contact them directly using the links above.
	</p>

	<h2>6. Children</h2>
	<p>
		Grids is suitable for anyone and does not knowingly collect information from anyone, including
		children, since it collects no information at all.
	</p>

	<h2>7. Changes to this policy</h2>
	<p>
		If Grids ever starts handling information differently, this policy will be updated before or
		when that change takes effect, and the "Last updated" date at the top of this page will change
		with it. The full history of this page is public in the
		<a href={REPO}>Grids GitHub repository</a>.
	</p>

	<h2>8. Contact</h2>
	<p>
		Questions about this policy can be raised by opening an issue on the
		<a href="{REPO}/issues">Grids GitHub repository</a>. Please don’t include personal information
		in a public issue.
	</p>
</LegalPage>
