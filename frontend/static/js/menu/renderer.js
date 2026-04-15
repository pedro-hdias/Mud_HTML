/**
 * menu/renderer.js - Criação e navegação DOM do menu interativo
 * Contém: createMenuContainer, handleMenuKeydown.
 * Mesclados em MenuManager via Object.assign em menu/controller.js.
 * Depende de: menu/parser.js (menuLogger)
 */

const _MenuRendererMethods = {
    /**
     * Cria o container HTML acessível para um menu de opções.
     * @param {Array} items - Array de { line, option, isPrompt }
     * @returns {HTMLElement} Elemento nav do menu
     */
    createMenuContainer(items) {
        const container = document.createElement("nav");
        container.className = "menu-container";
        container.setAttribute("role", "menu");
        container.setAttribute("aria-label", "Interactive options menu");

        const menuList = document.createElement("ul");
        menuList.className = "menu-list";
        menuList.setAttribute("role", "menubar");

        items.forEach((item, index) => {
            if (item.option) {
                const listItem = document.createElement("li");
                listItem.setAttribute("role", "none");

                const optionButton = document.createElement("button");
                optionButton.className = "menu-option";
                optionButton.setAttribute("role", "menuitem");
                optionButton.setAttribute("type", "button");
                optionButton.dataset.optionKey = item.option.key;
                optionButton.setAttribute("aria-label", `Option ${item.option.key}: ${item.option.text}`);
                optionButton.setAttribute("tabindex", index === 0 ? "0" : "-1");

                const numberSpan = document.createElement("span");
                numberSpan.className = "menu-number";
                numberSpan.setAttribute("aria-hidden", "true");
                numberSpan.textContent = `[${item.option.key}]`;

                const textSpan = document.createElement("span");
                textSpan.className = "menu-text";
                textSpan.textContent = item.option.text;

                optionButton.append(numberSpan, textSpan);
                optionButton.addEventListener("click", () => this.selectOption(item.option.key));
                optionButton.addEventListener("keydown", (e) => this.handleMenuKeydown(e, menuList));

                listItem.appendChild(optionButton);
                menuList.appendChild(listItem);
            } else if (item.isPrompt) {
                const promptEl = document.createElement("div");
                promptEl.className = "menu-prompt";
                promptEl.setAttribute("role", "status");
                promptEl.setAttribute("aria-live", "polite");
                promptEl.textContent = item.line;
                container.appendChild(promptEl);
            }
        });

        container.appendChild(menuList);
        return container;
    },

    /**
     * Gerencia navegação por teclado dentro do menu (setas, Home, End, Enter, Espaço).
     */
    handleMenuKeydown(e, menuList) {
        const menuItems = Array.from(menuList.querySelectorAll(".menu-option"));
        const currentIndex = menuItems.indexOf(e.target);
        let handled = true;
        let nextIndex = currentIndex;

        switch (e.key) {
            case "ArrowDown":
            case "Down":
                nextIndex = currentIndex < menuItems.length - 1 ? currentIndex + 1 : 0;
                menuItems[nextIndex].focus();
                break;

            case "ArrowUp":
            case "Up":
                nextIndex = currentIndex > 0 ? currentIndex - 1 : menuItems.length - 1;
                menuItems[nextIndex].focus();
                break;

            case "Home":
                menuItems[0].focus();
                break;

            case "End":
                menuItems[menuItems.length - 1].focus();
                break;

            case "Enter":
            case " ":
                this.selectOption(e.target.dataset.optionKey);
                break;

            default:
                handled = false;
        }

        if (handled) {
            e.preventDefault();
            e.stopPropagation();
        }
    }
};
