import { useEffect, useRef } from 'react';
import TomSelect from 'tom-select';
import 'tom-select/dist/css/tom-select.css';

export interface ThemedSelectOption {
  value: string;
  label: string;
}

interface ThemedSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: ThemedSelectOption[];
  style?: React.CSSProperties;
  className?: string;
}

const ThemedSelect = ({ value, onChange, options, style, className }: ThemedSelectProps) => {
  const selectRef = useRef<HTMLSelectElement>(null);
  const tomRef = useRef<TomSelect | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!selectRef.current) return;

    const instance = new TomSelect(selectRef.current, {
      controlInput: null,
      allowEmptyOption: true,
      // Render the open dropdown in <body> instead of in-place — several
      // dashboard cards use `overflow: hidden` for their rounded corners,
      // which was clipping the dropdown instead of letting it float above.
      dropdownParent: 'body',
      onChange: (val: string | string[]) => onChangeRef.current(String(val)),
    });
    tomRef.current = instance;

    return () => {
      instance.destroy();
      tomRef.current = null;
    };
    // Re-init whenever the option set changes (small lists, cheap to rebuild).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(options)]);

  useEffect(() => {
    if (tomRef.current && tomRef.current.getValue() !== value) {
      tomRef.current.setValue(value, true);
    }
  }, [value]);

  return (
    <div className={`themed-select ${className || ''}`} style={style}>
      <select ref={selectRef} defaultValue={value}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export default ThemedSelect;
