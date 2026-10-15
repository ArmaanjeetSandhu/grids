<script lang="ts">
	import { resolve } from '$app/paths';
	import LegalPage from '$lib/LegalPage.svelte';

	const REPO = 'https://github.com/ArmaanjeetSandhu/grids';
</script>

<LegalPage title="Terms of Service" updated="October 15, 2026" current="terms">
	<p>
		These Terms of Service ("Terms") govern your use of Grids, a free, browser-based tool for
		building crossword grids (the "Service"), made by Armaanjeet Singh Sandhu (the "developer"). By
		using the Service, you agree to these Terms. If you don’t agree, please don’t use it.
	</p>

	<h2>1. The Service</h2>
	<p>
		Grids lets you lay out crossword grids, fill in entries and clues, and import and export puzzles
		in the IPUZ format. It is free to use and requires no account. Everything runs in your browser;
		there is no Grids server that receives or processes your puzzles.
	</p>

	<h2>2. Your puzzles</h2>
	<ul>
		<li>
			<strong>You own what you make.</strong> The developer claims no rights in the grids, entries, clues
			or titles you create with Grids, or in the files you import.
		</li>
		<li>
			<strong>Your work is stored on your device.</strong> Grids saves your current puzzle and settings
			in your browser’s local storage so you can pick up where you left off. That data never leaves your
			device, and the developer can’t see, recover or restore it.
		</li>
		<li>
			<strong>Keep your own backups.</strong> Clearing your browser data, using a private window, switching
			browsers or devices, or starting a new grid can permanently remove a saved puzzle. Export anything
			you want to keep as an IPUZ file.
		</li>
	</ul>

	<h2>3. Acceptable use</h2>
	<p>You agree not to:</p>
	<ul>
		<li>
			import, create or distribute puzzles that infringe someone else’s copyright or other rights,
			or that you otherwise don’t have permission to use;
		</li>
		<li>use the Service for anything unlawful; or</li>
		<li>
			attempt to disrupt, overload or interfere with the Service or the infrastructure it is hosted
			on.
		</li>
	</ul>
	<p>
		You are responsible for the puzzles you make and for how you publish or share them, including
		any rights you need for third-party material they contain.
	</p>

	<h2>4. Open-source licence</h2>
	<p>
		The source code for Grids is available on <a href={REPO}>GitHub</a> under the MIT License. These Terms
		cover your use of the hosted Service; your use, copying, modification and distribution of the source
		code is governed by the MIT License. If the two conflict as to the code, the MIT License controls.
		The Grids name and the Service as hosted here are not licensed for use in a way that suggests your
		version is the official one.
	</p>

	<h2>5. Third-party services</h2>
	<p>
		The Service is hosted on GitHub Pages and loads its typeface from Google Fonts. Those providers
		may process technical information, such as your IP address, when your browser requests files
		from them, under their own terms and privacy policies. The link to GitHub takes you to a
		third-party site outside the developer’s control. See the <a href={resolve('/privacy')}
			>Privacy Policy</a
		> for more detail.
	</p>

	<h2>6. No warranty</h2>
	<p>
		The Service is provided "as is" and "as available", without warranties of any kind, express or
		implied, including warranties of merchantability, fitness for a particular purpose,
		non-infringement, accuracy, or that the Service will be uninterrupted, error-free or free of
		data loss. Features such as grid validation, symmetry checks and IPUZ import and export are
		aids, not guarantees; check your puzzle before you publish or submit it.
	</p>

	<h2>7. Limitation of liability</h2>
	<p>
		To the fullest extent permitted by law, the developer will not be liable for any indirect,
		incidental, special, consequential or punitive damages, or for any loss of data, work, profits
		or opportunity, arising out of or relating to your use of, or inability to use, the Service,
		even if the developer has been advised of the possibility of such damages. Because the Service
		is provided free of charge, the developer’s total liability for any claim relating to it is
		limited to zero, to the extent the law allows. Nothing in these Terms limits liability that
		cannot be limited under applicable law.
	</p>

	<h2>8. Changes to the Service and these Terms</h2>
	<p>
		The developer may change, suspend or discontinue all or part of the Service at any time, without
		notice, and may also update these Terms. When the Terms change, the "Last updated" date at the
		top of this page will change with them. If you keep using the Service after changes take effect,
		you accept the revised Terms.
	</p>

	<h2>9. General</h2>
	<p>
		If any part of these Terms is found unenforceable, the rest remains in effect. Not enforcing a
		provision is not a waiver of it. These Terms are the whole agreement between you and the
		developer about the hosted Service.
	</p>

	<h2>10. Contact</h2>
	<p>
		Questions about these Terms can be raised by opening an issue on the
		<a href="{REPO}/issues">Grids GitHub repository</a>.
	</p>
</LegalPage>
