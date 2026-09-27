// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { HiddenFieldInspector, ProactiveFormScanner } from '../src/heuristics/hidden-field-inspector';

describe('HiddenFieldInspector (TDD Suite for Autofill Phishing Detection)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('1. Детекція технік приховування полів (Cloaking Technique Detection)', () => {
    it('виявляє класичний .visually-hidden / sr-only (width: 1px, height: 1px, overflow: hidden, clip: rect(0,0,0,0))', () => {
      const div = document.createElement('div');
      div.style.cssText = 'position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); margin: -1px;';
      const input = document.createElement('input');
      input.name = 'card_number';
      input.autocomplete = 'cc-number';
      div.appendChild(input);
      document.body.appendChild(div);

      const res = HiddenFieldInspector.isElementCloaked(input);
      expect(res.isCloaked).toBe(true);
      expect(res.reason).toMatch(/visually-hidden|clip|dimensions/i);
    });

    it('виявляє приховування через clip-path (clip-path: inset(50%))', () => {
      const input = document.createElement('input');
      input.style.cssText = 'position: absolute; clip-path: inset(50%);';
      document.body.appendChild(input);

      const res = HiddenFieldInspector.isElementCloaked(input);
      expect(res.isCloaked).toBe(true);
      expect(res.reason).toMatch(/clip-path/i);
    });

    it('виявляє приховування через екстремальний оффскрін (left: -9999px або top: -5000px)', () => {
      const input = document.createElement('input');
      input.style.cssText = 'position: absolute; left: -9999px; top: -5000px;';
      document.body.appendChild(input);

      const res = HiddenFieldInspector.isElementCloaked(input);
      expect(res.isCloaked).toBe(true);
      expect(res.reason).toMatch(/offscreen|position/i);
    });

    it('виявляє приховування через нульову або мізерну прозорість (opacity: 0 або opacity < 0.05)', () => {
      const input = document.createElement('input');
      input.style.cssText = 'opacity: 0.01;';
      document.body.appendChild(input);

      const res = HiddenFieldInspector.isElementCloaked(input);
      expect(res.isCloaked).toBe(true);
      expect(res.reason).toMatch(/opacity/i);
    });

    it('виявляє приховування через transform (scale(0) або translateX(-9999px))', () => {
      const input = document.createElement('input');
      input.style.cssText = 'transform: scale(0);';
      document.body.appendChild(input);

      const res = HiddenFieldInspector.isElementCloaked(input);
      expect(res.isCloaked).toBe(true);
      expect(res.reason).toMatch(/transform/i);
    });

    it('виявляє приховування через обчислений transform: matrix(0, 0, 0, 0, 0, 0)', () => {
      const input = document.createElement('input');
      input.style.cssText = 'transform: matrix(0, 0, 0, 0, 0, 0);';
      document.body.appendChild(input);

      const res = HiddenFieldInspector.isElementCloaked(input);
      expect(res.isCloaked).toBe(true);
      expect(res.reason).toMatch(/transform/i);
    });

    it('виявляє приховування через мікро-розміри (width: 3px, height: 3px, overflow: hidden)', () => {
      const input = document.createElement('input');
      input.style.cssText = 'width: 3px; height: 3px; overflow: hidden;';
      document.body.appendChild(input);

      const res = HiddenFieldInspector.isElementCloaked(input);
      expect(res.isCloaked).toBe(true);
      expect(res.reason).toMatch(/visually-hidden dimensions/i);
    });

    it('виявляє стандартні display: none та visibility: hidden', () => {
      const input1 = document.createElement('input');
      input1.style.display = 'none';
      const input2 = document.createElement('input');
      input2.style.visibility = 'hidden';
      document.body.appendChild(input1);
      document.body.appendChild(input2);

      expect(HiddenFieldInspector.isElementCloaked(input1).isCloaked).toBe(true);
      expect(HiddenFieldInspector.isElementCloaked(input2).isCloaked).toBe(true);
    });

    it('виявляє прихованість через батьківський контейнер (Parent Container Cloaking)', () => {
      const wrapper = document.createElement('div');
      wrapper.style.display = 'none';
      const child = document.createElement('div');
      const input = document.createElement('input');
      child.appendChild(input);
      wrapper.appendChild(child);
      document.body.appendChild(wrapper);

      const res = HiddenFieldInspector.isElementCloaked(input);
      expect(res.isCloaked).toBe(true);
      expect(res.reason).toMatch(/parent/i);
    });

    it('не позначає як приховане звичайне видиме поле вводу', () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.style.cssText = 'width: 250px; height: 36px; display: block; opacity: 1;';
      document.body.appendChild(input);

      const res = HiddenFieldInspector.isElementCloaked(input);
      expect(res.isCloaked).toBe(false);
    });
  });

  describe('2. Класифікація чутливості полів (Sensitive Payment Field vs Safe CSRF)', () => {
    it('ідентифікує поля банківських карток як чутливі (cc-number, card_number, pan, iban)', () => {
      const inp1 = document.createElement('input');
      inp1.autocomplete = 'cc-number';
      const inp2 = document.createElement('input');
      inp2.name = 'card_number';
      const inp3 = document.createElement('input');
      inp3.placeholder = 'Номер картки';
      const inp4 = document.createElement('input');
      inp4.name = 'user_iban';

      expect(HiddenFieldInspector.isFieldSensitive(inp1).isSensitive).toBe(true);
      expect(HiddenFieldInspector.isFieldSensitive(inp2).isSensitive).toBe(true);
      expect(HiddenFieldInspector.isFieldSensitive(inp3).isSensitive).toBe(true);
      expect(HiddenFieldInspector.isFieldSensitive(inp4).isSensitive).toBe(true);
      expect(HiddenFieldInspector.isFieldSensitive(inp1).fieldType).toBe('CARD_NUMBER');
      expect(HiddenFieldInspector.isFieldSensitive(inp4).fieldType).toBe('CARD_NUMBER');
    });

    it('ідентифікує поля CVV / CVC коду як критично чутливі (cc-csc, cvv, cvc, pin)', () => {
      const inp = document.createElement('input');
      inp.autocomplete = 'cc-csc';
      inp.name = 'card_cvv';

      const res = HiddenFieldInspector.isFieldSensitive(inp);
      expect(res.isSensitive).toBe(true);
      expect(res.fieldType).toBe('CVV');
    });

    it('ідентифікує поля терміну дії картки (cc-exp, exp_month, exp_year)', () => {
      const inp = document.createElement('input');
      inp.autocomplete = 'cc-exp';

      const res = HiddenFieldInspector.isFieldSensitive(inp);
      expect(res.isSensitive).toBe(true);
      expect(res.fieldType).toBe('CARD_EXPIRY');
    });

    it('ідентифікує паролі (type="password", pass, pwd)', () => {
      const inp = document.createElement('input');
      inp.type = 'password';

      const res = HiddenFieldInspector.isFieldSensitive(inp);
      expect(res.isSensitive).toBe(true);
      expect(res.fieldType).toBe('PASSWORD');
    });

    it('НЕ позначає як чутливі легітимні технічні поля (CSRF, token, recaptcha, session)', () => {
      const inp1 = document.createElement('input');
      inp1.type = 'hidden';
      inp1.name = 'csrf_token';
      inp1.value = 'd83j2kd91kd0a';

      const inp2 = document.createElement('input');
      inp2.type = 'hidden';
      inp2.name = '_token';

      const inp3 = document.createElement('input');
      inp3.type = 'hidden';
      inp3.name = 'authenticity_token';

      expect(HiddenFieldInspector.isFieldSensitive(inp1).isSensitive).toBe(false);
      expect(HiddenFieldInspector.isFieldSensitive(inp2).isSensitive).toBe(false);
      expect(HiddenFieldInspector.isFieldSensitive(inp3).isSensitive).toBe(false);
    });

    it('НЕ позначає як чутливі звичайні контактні поля (телефон, ПІБ, адреса)', () => {
      const inp1 = document.createElement('input');
      inp1.type = 'tel';
      inp1.autocomplete = 'tel';
      inp1.name = 'phone';

      const inp2 = document.createElement('input');
      inp2.type = 'text';
      inp2.autocomplete = 'name';
      inp2.name = 'full_name';

      expect(HiddenFieldInspector.isFieldSensitive(inp1).isSensitive).toBe(false);
      expect(HiddenFieldInspector.isFieldSensitive(inp2).isSensitive).toBe(false);
    });
  });

  describe('3. Сканування форми на наявність пастки (Form Scan & Autofill Trap Detection)', () => {
    it('виявляє пастку autofill phishing у структурі зі сценарію delivery-scam.html', () => {
      const form = document.createElement('form');
      form.action = 'https://api.fake-scam-delivery.com/collect';

      // Видимі невинні поля
      const phoneInput = document.createElement('input');
      phoneInput.type = 'tel';
      phoneInput.autocomplete = 'tel';
      form.appendChild(phoneInput);

      // Прихована пастка (як у delivery-scam.html)
      const trapContainer = document.createElement('div');
      trapContainer.className = 'visually-hidden';
      trapContainer.style.cssText = 'position: absolute !important; width: 1px !important; height: 1px !important; overflow: hidden !important; clip: rect(0, 0, 0, 0) !important;';

      const cardInput = document.createElement('input');
      cardInput.name = 'card_number';
      cardInput.autocomplete = 'cc-number';

      const expInput = document.createElement('input');
      expInput.name = 'card_exp';
      expInput.autocomplete = 'cc-exp';

      const cvvInput = document.createElement('input');
      cvvInput.type = 'password';
      cvvInput.name = 'card_cvv';
      cvvInput.autocomplete = 'cc-csc';

      trapContainer.appendChild(cardInput);
      trapContainer.appendChild(expInput);
      trapContainer.appendChild(cvvInput);
      form.appendChild(trapContainer);
      document.body.appendChild(form);

      const result = HiddenFieldInspector.scanForm(form);
      expect(result.hasTrap).toBe(true);
      expect(result.flaggedInputs.length).toBe(3);
      expect(result.flaggedTypes).toContain('CARD_NUMBER');
      expect(result.flaggedTypes).toContain('CVV');
      expect(result.flaggedTypes).toContain('CARD_EXPIRY');
      expect(result.heuristicResult.severity).toBe('CRITICAL');
      expect(result.heuristicResult.scoreContribution).toBe(50);
      expect(result.heuristicResult.message).toContain('Autofill Phishing');
    });

    it('не піднімає тривогу для форми з легітимними CSRF-токенами та відкритими полями', () => {
      const form = document.createElement('form');
      form.action = '/login';

      const csrf = document.createElement('input');
      csrf.type = 'hidden';
      csrf.name = 'csrf_token';
      csrf.value = 'token123';
      form.appendChild(csrf);

      const email = document.createElement('input');
      email.type = 'email';
      email.name = 'email';
      form.appendChild(email);

      document.body.appendChild(form);

      const result = HiddenFieldInspector.scanForm(form);
      expect(result.hasTrap).toBe(false);
      expect(result.flaggedInputs.length).toBe(0);
    });
  });

  describe('4. Превентивне знешкодження автозаповнення (Autofill Disarm)', () => {
    it('знешкоджує приховані чутливі поля, встановлюючи autocomplete="off" та блокуючи автозаповнення', () => {
      const form = document.createElement('form');
      const trapDiv = document.createElement('div');
      trapDiv.style.display = 'none';

      const cardInput = document.createElement('input');
      cardInput.name = 'card_number';
      cardInput.autocomplete = 'cc-number';
      trapDiv.appendChild(cardInput);
      form.appendChild(trapDiv);
      document.body.appendChild(form);

      const disarmedCount = HiddenFieldInspector.disarmForm(form);
      expect(disarmedCount).toBe(1);
      expect(cardInput.getAttribute('autocomplete')).toBe('off');
      expect(cardInput.disabled).toBe(true);
      expect(cardInput.dataset.threatShieldDisarmed).toBe('true');
    });
  });

  describe('5. Проактивний сканер форм (ProactiveFormScanner)', () => {
    it('проактивно виявляє приховану пастку при завантаженні та викликає onTrapDetected', () => {
      const form = document.createElement('form');
      const trap = document.createElement('div');
      trap.style.display = 'none';
      const cardInput = document.createElement('input');
      cardInput.name = 'card_number';
      cardInput.autocomplete = 'cc-number';
      trap.appendChild(cardInput);
      form.appendChild(trap);
      document.body.appendChild(form);

      let detectedTrap: any = null;
      let detectedForm: any = null;

      ProactiveFormScanner.init({
        onTrapDetected: (scan, f) => {
          detectedTrap = scan;
          detectedForm = f;
        },
      }, 'fake-delivery.com');

      expect(detectedTrap).not.toBeNull();
      expect(detectedTrap.hasTrap).toBe(true);
      expect(detectedForm).toBe(form);
      // Автоматичне превентивне знешкодження
      expect(cardInput.disabled).toBe(true);
      expect(cardInput.getAttribute('autocomplete')).toBe('off');

      ProactiveFormScanner.stop();
    });

    it('ігнорує пастки на дозволених або акредитованих доменах (Whitelist bypass)', () => {
      const form = document.createElement('form');
      const trap = document.createElement('div');
      trap.style.display = 'none';
      const card = document.createElement('input');
      card.name = 'card_number';
      trap.appendChild(card);
      form.appendChild(trap);
      document.body.appendChild(form);

      let triggered = false;
      ProactiveFormScanner.init({
        onTrapDetected: () => { triggered = true; },
        isDomainAllowed: (domain) => domain === 'liqpay.ua',
      }, 'liqpay.ua');

      expect(triggered).toBe(false);
      ProactiveFormScanner.stop();
    });
  });

  describe('6. Запобігання хибним спрацьовуванням (False Positive Prevention - Djinni.co & Web Menus)', () => {
    it('НЕ вважає поле "company_type" (меню пошуку з djinni.co) номером банківської картки чи чутливим полем', () => {
      const inp = document.createElement('input');
      inp.name = 'company_type';
      inp.placeholder = 'Тип компанії';

      const res = HiddenFieldInspector.isFieldSensitive(inp);
      expect(res.isSensitive).toBe(false);
      expect(res.fieldType).toBeUndefined();
    });

    it('НЕ класифікує типові фільтри djinni.co як чутливі поля (primary_keyword, experience, expected_salary, location)', () => {
      const fields = ['primary_keyword', 'experience', 'expected_salary', 'company', 'location', 'english_level'];
      for (const name of fields) {
        const inp = document.createElement('input');
        inp.name = name;
        const res = HiddenFieldInspector.isFieldSensitive(inp);
        expect(res.isSensitive).toBe(false);
      }
    });

    it('НЕ реагує на збіги підрядків у звичайних словах (shipping_method, opinion, passport, passenger, admin_panel, timespan)', () => {
      // pin in shipping/opinion, pass in passport/passenger, pan in panel/timespan
      const testCases = [
        { name: 'shipping_method', desc: 'shipping method' },
        { name: 'opinion_id', desc: 'user opinion' },
        { name: 'passport_number', desc: 'passport' },
        { name: 'passenger_name', desc: 'passenger' },
        { name: 'admin_panel', desc: 'panel' },
        { name: 'timespan', desc: 'span' },
        { name: 'bypass_cache', desc: 'bypass' },
      ];

      for (const tc of testCases) {
        const inp = document.createElement('input');
        inp.name = tc.name;
        const res = HiddenFieldInspector.isFieldSensitive(inp);
        expect(res.isSensitive, `Field ${tc.name} should not be sensitive`).toBe(false);
      }
    });

    it('відсікає не-текстові типи контролів (checkbox, radio, search, select)', () => {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.name = 'company_type';
      checkbox.value = 'product';

      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'company_type';
      radio.value = 'outsourcing';

      const select = document.createElement('select');
      select.name = 'company_type';

      const search = document.createElement('input');
      search.type = 'search';
      search.name = 'company_query';

      expect(HiddenFieldInspector.isFieldSensitive(checkbox).isSensitive).toBe(false);
      expect(HiddenFieldInspector.isFieldSensitive(radio).isSensitive).toBe(false);
      expect(HiddenFieldInspector.isFieldSensitive(select).isSensitive).toBe(false);
      expect(HiddenFieldInspector.isFieldSensitive(search).isSensitive).toBe(false);
    });

    it('не піднімає тривогу для повноцінної пошукової форми djinni.co із прихованими фільтрами', () => {
      const form = document.createElement('form');
      form.action = 'https://djinni.co/jobs/';
      form.method = 'GET';

      // Видиме поле пошуку
      const searchInput = document.createElement('input');
      searchInput.type = 'text';
      searchInput.name = 'primary_keyword';
      searchInput.placeholder = 'Пошук за посадою чи навичками';
      form.appendChild(searchInput);

      // Приховане меню фільтрів (collapsed dropdown)
      const dropdownMenu = document.createElement('div');
      dropdownMenu.className = 'dropdown-menu';
      dropdownMenu.style.display = 'none';

      const companyTypeInput = document.createElement('input');
      companyTypeInput.type = 'hidden';
      companyTypeInput.name = 'company_type';
      companyTypeInput.value = 'product';
      dropdownMenu.appendChild(companyTypeInput);

      const expInput = document.createElement('input');
      expInput.type = 'checkbox';
      expInput.name = 'experience';
      expInput.value = '2';
      dropdownMenu.appendChild(expInput);

      form.appendChild(dropdownMenu);
      document.body.appendChild(form);

      const scanResult = HiddenFieldInspector.scanForm(form);
      expect(scanResult.hasTrap).toBe(false);
      expect(scanResult.flaggedInputs.length).toBe(0);
    });

    it('правильно відновлює знешкоджену форму через restoreForm()', () => {
      const form = document.createElement('form');
      const trapDiv = document.createElement('div');
      trapDiv.style.display = 'none';

      const cardInput = document.createElement('input');
      cardInput.name = 'card_number';
      cardInput.autocomplete = 'cc-number';
      trapDiv.appendChild(cardInput);
      form.appendChild(trapDiv);
      document.body.appendChild(form);

      // Знешкодження
      HiddenFieldInspector.disarmForm(form);
      expect(cardInput.disabled).toBe(true);
      expect(cardInput.getAttribute('autocomplete')).toBe('off');

      // Відновлення
      const restoredCount = HiddenFieldInspector.restoreForm(form);
      expect(restoredCount).toBe(1);
      expect(cardInput.disabled).toBe(false);
      expect(cardInput.getAttribute('autocomplete')).toBe('cc-number');
      expect(cardInput.dataset.threatShieldDisarmed).toBeUndefined();
    });
  });
});
