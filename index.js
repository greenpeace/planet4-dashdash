const postcss = require("postcss");

const generatePrefix = selector => {
    // Replace
    // 1. the shorthand
    // 2. consecutive non word or dash chars with --
    // 3&4. remove all dashes at start and end, and add exactly 2 at the front.
    return `--${selector.replace(/_--/, '').replace(/[^\w-]+/g, '--').replace(/^-*/, '').replace(/-*$/, '')}`;
}

// Travel up to the first parent that is a media query, and if found generate a prefix from its params.
// NOTE: This does not account for nested media queries for now, it will pick the innermost one only.
// todo: Allow configuring aliases for the params.
const generateMediaQueryPrefix = rule => {
    let parent = rule;

    do {
        parent = parent.parent;
        if (parent && parent.name === 'media') {
            return generatePrefix(parent.params);
        }
    } while (parent);

    // No parent is a media query, so no prefix.
    return '';
}

const DASH_DASH_REGEX = /^(.+ )?_?--(\w+(-\w+)*--)*(:(hover|focus|active|disabled|visited))?$/;

const replaceShorthandSelectors = (css, result) => {
    let prevRule = null;
    css.walkRules(rule => {
        const rulesWithDashDash = rule.selectors.filter(
            selector => DASH_DASH_REGEX.test(selector)
        );

        // Nothing to do here, go to next rule.
        if (rulesWithDashDash.length === 0) {
            prevRule = rule;
            return;
        }

        // If somehow there is a shorthand on some but not all of the selectors, we cannot do the substitution.
        // Not sure if that's possible but we definitely want the build to fail in that case.
        if (rule.selectors.length > 1 && rule.selectors.length > rulesWithDashDash) {
            throw new Error('Something went wrong, -- should be on all the selectors ' . rule.selectors.join());
        }

        const parts = rule.selectors[0].split(' ');
        parts.reverse();
        const lastPart = parts[0];

        const prefix = `${lastPart.replace(/[:_]/g, '').replace(/--$/, '')}`;
        const withoutPseudo = lastPart.replace(/:(hover|focus|active|disabled|visited)/g, '');

        const isPrefixGenerate = '_--' === withoutPseudo;

        if ( isPrefixGenerate && rule.selectors.length > 1) {
            throw new Error('Cannot generate prefix when using multiple selectors. ' . rule.selectors.join());
        }

        const newDecls = [];

        rule.walkDecls(decl=> {
            const rulePrefix = isPrefixGenerate ? generatePrefix(rule.selectors[0]) : prefix;
            const mediaQueryPrefix = generateMediaQueryPrefix(rule);

            const varName = `${mediaQueryPrefix}${rulePrefix}--${decl.prop}`;

            const newDecl = postcss.decl({
                prop: decl.prop,
                value: `var(${varName}, ${decl.value})`,
            });
            newDecls.push(newDecl);
            decl.remove();
        });

        // Preserve the pseudo class.
        const expectedTargetSelectors = rule.selectors.map(selector => selector.replace(` ${withoutPseudo}`, ''));
        const expectedTargetSelector = expectedTargetSelectors.join();

        if (prevRule && prevRule.parent === rule.parent && prevRule.selectors.join() === expectedTargetSelector) {
            prevRule.append(newDecls);
            return;
        }
        const newRule = postcss.rule({
            selectors: expectedTargetSelectors,
            source: rule.source,
        });
        newRule.append(...newDecls);
        rule.after(newRule);
        rule.remove();
        prevRule = newRule;
    })
};

module.exports = postcss.plugin('dash-dash', () => replaceShorthandSelectors)
